import Phase3B10CSellerOrderNotifier from './components/Phase3B10CSellerOrderNotifier';
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
 <React.StrictMode>
 <>
      <Phase3B10CSellerOrderNotifier />
      <App />
    </>
 </React.StrictMode>
);






