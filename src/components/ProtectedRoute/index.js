// ProtectedRoute.jsx
import React, { useEffect, useState } from "react";
import { Route, Redirect } from "react-router-dom";
const API = process.env.REACT_APP_BACKEND_URL;

const ProtectedRoute = ({ component: Component, ...rest }) => {
  const [auth, setAuth] = useState(null); // null = loading, false = not auth, true = auth

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API}/api/auth/me`, {
          method: "GET",
          credentials: "include", // ✅ send cookies
        });

        if (!mounted) return;

        if (res.ok) {
          setAuth(true);
        } else {
          setAuth(false);
        }
      } catch (e) {
        if (mounted) setAuth(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  if (auth === null) {
    // Show a loader while checking authentication
    return <div>Loading...</div>;
  }

  return (
    <Route
      {...rest}
      render={(props) =>
        auth ? <Component {...props} /> : <Redirect to="/login" />
      }
    />
  );
};

export default ProtectedRoute;
