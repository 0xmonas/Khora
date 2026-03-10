# Access Control Security Checklist

Non-obvious access control vulnerabilities beyond basic missing modifiers.

## Centralization Risks

- [ ] **Admin can perform token transfers on behalf of users**: If admin functions exist that can move user tokens (e.g., `rescueTokens`, `emergencyWithdraw` with admin-controlled recipient), the admin can rug users. Look for: any admin function that calls `transfer()` or `transferFrom()` with an admin-controlled destination. [beirao A-01, Nascent toolkit]

- [ ] **Instant parameter changes without timelock**: Admin can change critical parameters (fee rates, oracle addresses, collateral factors) instantly. Users have no time to react. Look for: `onlyOwner` setter functions for critical parameters without a timelock delay or event emission. [beirao A-01, G-02]

- [ ] **Total upgradeability**: If the admin can upgrade to any arbitrary implementation, the contract is effectively a multisig-controlled wallet. Look for: UUPS/Transparent proxy where `_authorizeUpgrade` only checks `onlyOwner` with no timelock, governance, or other constraints. [beirao A-01]

- [ ] **Pausing that blocks critical user operations**: If pause can block withdrawals or collateral additions while liquidations remain active, users are unfairly liquidated. Look for: `whenNotPaused` on deposit/withdraw but not on liquidation functions. [beirao A-01, G-09]

- [ ] **Corrupted owner can destroy the protocol**: Evaluate what happens if the owner key is compromised. Can the attacker drain all funds? Can they brick the contract permanently? Look for: single-point-of-failure admin patterns without multisig or timelock. [beirao A-02]

## Privilege Escalation

- [ ] **Missing access controls on sensitive functions**: Functions like `mint()`, `burn()`, `setOracle()`, `setFee()`, `pause()` without access modifiers are callable by anyone. Look for: public/external functions that modify critical state without any access check. [beirao A-03, A-06]

- [ ] **Two-step ownership transfer not implemented**: Single-step `transferOwnership` to a wrong address permanently locks out the owner. Look for: `Ownable.transferOwnership()` without `Ownable2Step` pattern. [beirao A-05]

- [ ] **Functions operating on other users assume msg.sender is the user**: If a function allows specifying a target user, an attacker can operate on others' positions. Look for: functions with a `user` parameter where operations should only be callable by that user or approved operators. [Tamjid F-16]

- [ ] **Whitelist bypass via proxy tokens**: If a protocol whitelists specific addresses but doesn't check for proxy/alias addresses, users can bypass restrictions using alternate token addresses. Look for: address-based whitelists that don't account for proxy patterns. [beirao A-04]

## Role Management

- [ ] **Roles granted in constructor but not documented**: Critical roles (minter, pauser, admin) granted during deployment may not be obvious to auditors or users. Look for: `_grantRole()` in constructors without clear documentation. [SCSVS, Nascent]

- [ ] **No cap on privileged role count**: If an unlimited number of addresses can be granted a privileged role, governance is diluted or a compromised address can grant itself more roles. Look for: role-granting functions without limits on role member count. [Nascent toolkit]

- [ ] **Renounce ownership can brick contract**: If `renounceOwnership()` is called on a contract that requires an owner for critical operations (upgrades, parameter changes, unpausing), the contract becomes permanently stuck. Look for: contracts that inherit `Ownable` and have owner-only functions critical for operation. [Nascent toolkit]

## Initialization & Deployment

- [ ] **Initializer can be called by anyone on implementation contract**: Without `_disableInitializers()` in the constructor, an attacker can call `initialize()` on the implementation directly, potentially gaining ownership. Look for: upgradeable contracts without `constructor() { _disableInitializers(); }`. [beirao P-06]

- [ ] **Deploy scripts not included in audit scope**: Deployment order, parameter values, and role assignments in deploy scripts are as security-critical as runtime code. An incorrect deployment can leave contracts in a vulnerable state. Look for: deploy scripts that set up permissions or initial state. [Nascent audit-readiness]

## Multi-Agent Access

- [ ] **When all agents are the same person**: In multi-role systems (liquidator, borrower, LP), consider what happens if one entity controls all roles simultaneously. Self-liquidation, self-arbitrage, circular collateral. Look for: cross-role interactions where same-address scenarios aren't tested. [beirao G-22]
