import { useEffect, useRef, useState } from 'react';
import { useUtil } from 'src/packages/core/hooks';
import { useAuth } from 'src/packages/core/stores/auth';

let loginRedirectStarted = false;

export default function useLoginPageController(returnTo: string) {
  const auth = useAuth();
  const { getErrorMessage } = useUtil();
  const startedLogin = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status === 'authenticated' || startedLogin.current || loginRedirectStarted) {
      return
    }

    startedLogin.current = true
    loginRedirectStarted = true

    void auth.login(returnTo).catch((loginError: unknown) => {
      startedLogin.current = false
      loginRedirectStarted = false
      setError(getErrorMessage(loginError))
    })
  }, [auth, returnTo, getErrorMessage]);

  function retryLogin() {
    loginRedirectStarted = true
    void auth.login(returnTo).catch((loginError: unknown) => {
      loginRedirectStarted = false
      setError(getErrorMessage(loginError))
    })
  };

  return {
    auth,
    error,
    retryLogin,
    returnTo,
  }
}
