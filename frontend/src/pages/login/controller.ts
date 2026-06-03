import { useEffect, useRef, useState } from 'react';
import { useUtil } from 'src/packages/core/hooks';
import { useAuth } from 'src/packages/core/stores/auth';

export default function useLoginPageController(returnTo: string) {
  const auth = useAuth();
  const { getErrorMessage } = useUtil();
  const startedLogin = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status === 'authenticated' || startedLogin.current) {
      return
    }

    startedLogin.current = true

    void auth.login(returnTo).catch((loginError: unknown) => {
      startedLogin.current = false
      setError(getErrorMessage(loginError))
    })
  }, [auth, returnTo, getErrorMessage]);

  function retryLogin() {
    void auth.login(returnTo).catch((loginError: unknown) => {
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
