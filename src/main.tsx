import Phase3B10DCheckoutOngkirSummaryNoteFix from './components/Phase3B10DCheckoutOngkirSummaryNoteFix';
import Phase3B10DSellerMobileBuyerPreview from './components/Phase3B10DSellerMobileBuyerPreview';
import Phase3B10DFirefoxCheckoutScrollFix from './components/Phase3B10DFirefoxCheckoutScrollFix';
import Phase3B10DStorePaymentAccountsSettings from './components/Phase3B10DStorePaymentAccountsSettings';
import Phase3B10EMultiOrderPaymentBridge from './components/Phase3B10EMultiOrderPaymentBridge';
import Phase3B10CSellerOrderNotifier from './components/Phase3B10CSellerOrderNotifier';
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
 <React.StrictMode>
 <>
      <Phase3B10CSellerOrderNotifier />
      <>
      <>
      <Phase3B10EMultiOrderPaymentBridge />
      <App />
      <Phase3B10DCheckoutOngkirSummaryNoteFix />
      <Phase3B10DSellerMobileBuyerPreview />
      <Phase3B10DFirefoxCheckoutScrollFix />
      <Phase3B10DStorePaymentAccountsSettings />
    </>
    </>
    </>
 </React.StrictMode>
);





















