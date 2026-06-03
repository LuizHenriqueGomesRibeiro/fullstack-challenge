import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../packages/core/hooks/auth'
import { useUtil } from '../../packages/core/hooks'

export default function useAuthCallbackPageController() {
  const auth = useAuth()
  const { getErrorMessage } = useUtil()
  const handledCallback = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (handledCallback.current) {
      return
    }

    handledCallback.current = true

    void auth
      .completeLogin()
      .then((returnTo) => window.location.replace(returnTo))
      .catch((callbackError: unknown) => {
        setError(getErrorMessage(callbackError))
      })
  }, [auth, getErrorMessage])

  return {
    error,
  }
}
