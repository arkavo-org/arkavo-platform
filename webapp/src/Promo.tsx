import React from "react";
import { useAuth } from "./context/AuthContext";
import "./css/Promo.css";

const Promo: React.FC = () => {
  const { login, isLoading } = useAuth();

  return (
    <div className="promo-shell">
      <div className="promo-hero">
        <div className="promo-hero-text">
          <span className="promo-kicker">Arkavo Secure Messaging</span>
          <h1>Secure Messaging Platform built for the Intelligence Community</h1>
          <p>
            Mission-grade collaboration with policy-driven access, end-to-end
            protection, and auditable delivery across multi-agency networks.
          </p>
          <div className="promo-actions">
            <div className="promo-callout">What are you waiting for?</div>
            <button
              className="promo-primary"
              onClick={() => login()}
              disabled={isLoading}
            >
              Sign In
            </button>
          </div>
        </div>
        <div className="promo-hero-card">
          <div className="promo-card-header">
            <div className="promo-card-tag">Operational Assurance</div>
            <div className="promo-card-title">Secure by design</div>
          </div>
          <div className="promo-card-body">
            <div className="promo-card-row">
              <span>Trusted Data Format (TDF)</span>
              <strong>Policy enforced</strong>
            </div>
            <div className="promo-card-row">
              <span>Zero-trust message routing</span>
              <strong>Segmentation aware</strong>
            </div>
            <div className="promo-card-row">
              <span>Continuous session validation</span>
              <strong>Adaptive assurance</strong>
            </div>
            <div className="promo-card-row">
              <span>Audit-ready delivery logs</span>
              <strong>Chain-of-custody</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="promo-details" id="capabilities">
        <div className="promo-detail">
          <h2>Multi-agency collaboration without data leakage</h2>
          <p>
            Share sensitive information while maintaining compartmentalized
            controls, classification awareness, and enforced data retention
            policies.
          </p>
        </div>
        <div className="promo-detail">
          <h2>Resilient operations for the edge</h2>
          <p>
            Built for contested environments with offline readiness,
            deterministic delivery, and integrity checks for every payload.
          </p>
        </div>
        <div className="promo-detail">
          <h2>Unified mission signal</h2>
          <p>
            Consolidate communications, tasking, and evidence trails in one
            platform tailored for analysts, operators, and mission leaders.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Promo;
