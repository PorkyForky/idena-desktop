import {Machine, assign} from 'xstate'
import {log, raise} from 'xstate/lib/actions'
import {fetchVotings} from './utils'
import {VotingStatus} from '../../shared/types'
import {callRpc} from '../../shared/utils/utils'
import {epochDb} from '../../shared/utils/db'
import {bufferToHex} from '../../shared/utils/string'

export const votingListMachine = Machine(
  {
    context: {
      votings: [],
      filteredVotings: [],
      filter: VotingStatus.All,
    },
    initial: 'loading',
    states: {
      loading: {
        invoke: {
          src: 'loadVotings',
          onDone: {
            target: 'loaded',
            actions: [
              assign((context, {data}) => ({
                ...context,
                votings: data,
                filteredVotings: data,
              })),
              log(),
            ],
          },
          onError: {
            target: '',
          },
        },
      },
      loaded: {
        on: {
          FILTER: {
            actions: [
              assign({
                filteredVotings: ({votings}, {filter}) =>
                  votings.filter(
                    ({status}) =>
                      status === filter || filter === VotingStatus.All
                  ),
                filter: (_, {filter}) => filter,
              }),
              log(),
            ],
          },
        },
      },
    },
  },
  {
    services: {
      loadVotings: async ({epoch: {epoch}}) => {
        let persistedVotings = []
        try {
          persistedVotings = await epochDb('votings', epoch).all()
        } catch (error) {
          console.error(error, error.notFound)
          if (!error.notFound) throw new Error(error)
        }

        try {
          const knownVotings = await fetchVotings()
          return persistedVotings.concat(knownVotings)
        } catch (error) {
          if (error.notFound) return []
          throw error
        }
      },
    },
  }
)

export const createNewVotingMachine = epoch =>
  Machine(
    {
      context: {
        epoch: {
          epoch,
        },
      },
      initial: 'idle',
      states: {
        idle: {
          on: {
            CHANGE: {
              target: 'dirty',
              actions: [raise((_, e) => e)],
            },
          },
        },
        dirty: {
          on: {
            CHANGE: {
              actions: ['onChange', log()],
            },
            PUBLISH: {
              target: 'publishing',
              actions: [log()],
            },
          },
        },
        publishing: {
          initial: 'deployingContract',
          entry: ['onPublishing', log()],
          states: {
            deployingContract: {
              initial: 'estimating',
              states: {
                estimating: {
                  invoke: {
                    src: 'estimateDeployContract',
                    onDone: {
                      target: 'deploying',
                      actions: [
                        assign(
                          (
                            context,
                            {
                              data: {
                                contract: contractHash,
                                txHash,
                                gasCost,
                                txFee,
                              },
                            }
                          ) => ({
                            ...context,
                            contractHash,
                            txHash,
                            gasCost,
                            txFee,
                          })
                        ),
                        log(),
                      ],
                    },
                  },
                },
                deploying: {
                  invoke: {
                    src: 'deployContract',
                    onDone: {
                      target: 'deployed',
                      actions: [
                        assign({
                          txHash: (_, {data}) => data,
                        }),
                        log(),
                      ],
                    },
                    onError: {
                      actions: [log()],
                    },
                  },
                },
                deployed: {},
              },
            },
          },
        },
      },
    },
    {
      actions: {
        onChange: assign((context, {name, value}) => ({
          ...context,
          [name]: value,
        })),
        // eslint-disable-next-line no-shadow
        onPublishing: ({epoch, ...voting}) => {
          // const db = epochDb('votings', epoch)
          // db.put(voting)
        },
      },
      services: {
        estimateDeployContract: async ({
          identity: {address: from},
          ...voting
        }) => {
          const {title, desc, startDate} = voting

          const content = bufferToHex(
            Buffer.from(
              new TextEncoder().encode(
                JSON.stringify({
                  title,
                  desc,
                })
              )
            )
          )

          return callRpc('dna_estimateDeployContract', {
            from,
            codeHash: '0x02',
            amount: 1,
            args: [
              {
                index: 0,
                format: 'hex',
                value: content,
              },
              {
                index: 1,
                format: 'uint64',
                value: new Date(startDate).valueOf().toString(),
              },
            ],
          })
        },
        deployContract: async ({
          // eslint-disable-next-line no-shadow
          epoch: {epoch},
          identity: {address: from},
          ...voting
        }) => {
          const {title, desc, startDate, gasCost, txFee} = voting

          const content = bufferToHex(
            Buffer.from(
              new TextEncoder().encode(
                JSON.stringify({
                  title,
                  desc,
                })
              )
            )
          )

          const deployResult = await callRpc('dna_deployContract', {
            from,
            codeHash: '0x02',
            contractStake: 1000,
            amount: 1,
            maxFee: Math.ceil((gasCost + txFee) * 1.1),
            args: [
              {
                index: 0,
                format: 'hex',
                value: content,
              },
              {
                index: 1,
                format: 'uint64',
                value: new Date(startDate).valueOf().toString(),
              },
            ],
            nonce: 10,
          })

          const db = epochDb('votings', epoch)
          await db.put({...voting, issuer: from})

          return deployResult
        },
      },
    }
  )
