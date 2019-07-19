import React, {useEffect} from 'react'
import Router from 'next/router'
import {backgrounds, rem, padding, position} from 'polished'
import ValidationHeader from '../../screens/validation/components/validation-header'
import ValidationScene from '../../screens/validation/components/validation-scene'
import ValidationActions from '../../screens/validation/components/validation-actions'
import FlipThumbnails from '../../screens/validation/components/flip-thumbnails'
import Flex from '../../shared/components/flex'
import {useInterval} from '../../shared/hooks/use-interval'
import {Link, IconClose} from '../../shared/components'
import Timer from '../../screens/validation/components/timer'
import {useEpochState} from '../../shared/providers/epoch-context'
import theme from '../../shared/theme'
import Layout from '../../shared/components/layout'
import {
  useValidationDispatch,
  submitLongAnswers,
  START_FETCH_FLIPS,
  PREV,
  NEXT,
  ANSWER,
  REPORT_ABUSE,
  PICK,
  useValidationState,
  SessionType,
  fetchFlips,
} from '../../shared/providers/validation-context'
import Spinner from '../../screens/validation/components/spinner'

export default function() {
  const state = useValidationState()
  const dispatch = useValidationDispatch()
  const epoch = useEpochState()

  useEffect(() => {
    if (!state.ready && !state.longAnswersSubmitted) {
      dispatch({type: START_FETCH_FLIPS})
    }
  }, [dispatch, state.longAnswersSubmitted, state.ready])

  useInterval(
    async () => {
      await fetchFlips(dispatch, SessionType.Long)
    },
    state.ready ? null : 1000,
    true
  )

  const handleSubmitAnswers = async () => {
    await submitLongAnswers(dispatch, state.flips, epoch.epoch)
    Router.push('/dashboard')
  }

  return (
    <Layout>
      <Flex
        direction="column"
        css={{
          ...backgrounds(theme.colors.white),
          height: '100vh',
          ...padding(
            rem(theme.spacings.medium24),
            rem(theme.spacings.large),
            rem(theme.spacings.medium16)
          ),
          ...position('relative'),
        }}
      >
        <ValidationHeader
          type={SessionType.Long}
          currentIndex={state.currentIndex}
          total={state.flips.length}
        >
          <Link href="/dashboard">
            <IconClose />
          </Link>
        </ValidationHeader>
        <Flex
          direction="column"
          align="center"
          flex={1}
          css={position('relative')}
        >
          {state.loading && <Spinner />}
          {state.flips[state.currentIndex] && (
            <ValidationScene
              flip={state.flips[state.currentIndex]}
              onPrev={() => dispatch({type: PREV})}
              onNext={() => dispatch({type: NEXT})}
              onAnswer={option => dispatch({type: ANSWER, option})}
              isFirst={state.currentIndex === 0}
              isLast={state.currentIndex >= state.flips.length - 1}
              type={SessionType.Long}
            />
          )}
        </Flex>
        <ValidationActions
          onReportAbuse={hash => dispatch({type: REPORT_ABUSE, hash})}
          canSubmit={state.canSubmit}
          onSubmitAnswers={handleSubmitAnswers}
          countdown={<Timer type={SessionType.Long} />}
        />
        <FlipThumbnails
          currentIndex={state.currentIndex}
          flips={state.flips}
          onPick={index => dispatch({type: PICK, index})}
        />
      </Flex>
    </Layout>
  )
}
