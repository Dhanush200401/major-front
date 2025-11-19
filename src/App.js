import React from "react";
import { BrowserRouter, Switch, Route } from "react-router-dom";

import Signup from "./components/Signup";
import Login from "./components/Login";
import Avatars from "./components/Avatars";
import Home from "./components/Home";
import NotFound from "./components/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import Meeting from "./components/Meeting";
import Chat from "./components/Chat";

const App = () => {
  return (
    <BrowserRouter>
      <Switch>
        <Route exact path="/signup" component={Signup} />
        <Route exact path="/login" component={Login} />
        <ProtectedRoute exact path="/avatars" component={Avatars} />
        <ProtectedRoute exact path="/" component={Home} />
        <ProtectedRoute exact path="/meeting" component={Meeting} />
        <ProtectedRoute exact path="/chat" component={Chat} />
        <Route component={NotFound} />
      </Switch>
    </BrowserRouter>
  );
};

export default App;
