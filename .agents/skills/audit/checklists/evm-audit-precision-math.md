# Precision & Math Security Checklist

## Division Before Multiplication

- [ ] **Always multiply before dividing**: `(a / b) * c` loses precision from the division. Must be `(a * c) / b`. This is the single most common precision bug in DeFi. Look for: any expression where a division appears to the left of a multiplication. [Dacian, ERC4626 primer pattern #35]

- [ ] **Hidden division-before-multiplication in library calls**: Expand function calls to reveal hidden ordering. Example: `utilRate.wmul(slope1).wdiv(optimalUsageRate)` expands to `utilRate * (slope1 / 1e18) * (1e18 / optimalUsageRate)` — division before multiplication. Fix: `utilRate * slope1 / optimalUsageRate`. Look for: chained `mulDiv`, `wmul`, `wdiv` calls where the division happens first. [Dacian, ERC4626 primer]

- [ ] **Extra divisions by scaling factor**: A common copy-paste bug is dividing by 1e18 twice instead of once. Example: `(amountToBuyLeftUSD * 1e18 / collateralval) / 1e18) / 1e18` — the last `/1e18` destroys 18 digits of precision. Look for: sequential divisions by the same constant. [ERC4626 primer USSD example]

- [ ] **Division resulting in zero for small values**: When `amount < divisor`, Solidity integer division returns 0. Example: `(amount * rewardRate) / totalSupply` returns 0 when `amount * rewardRate < totalSupply`. Look for: intermediate values that could be < the denominator. [Dacian]

## Rounding Direction

- [ ] **Protocol-favoring rounding rule**: Deposits/mints should round DOWN (give fewer shares). Withdrawals/redeems should round UP (burn more shares). Any deviation means users can extract rounding dust. Look for: `mulDiv` or division calls without explicit rounding direction in vault math. [ERC4626 checklist]

- [ ] **Inconsistent rounding across functions**: If `deposit()` rounds one way and `withdraw()` rounds the same way, an attacker can loop deposits/withdrawals to extract dust each cycle. Look for: both deposit and withdraw using `Math.mulDiv` with the same rounding mode. [ERC4626 checklist M1]

- [ ] **Inverse fee calculation error**: When converting between assets and shares with fees: `shares = assets / (1 - fee)` NOT `shares = assets * (1 - fee)`. The latter under-charges. Look for: fee-adjusted conversion formulas. [ERC4626 checklist M5]

## Integer Overflow/Underflow (Even with Solidity ≥0.8)

- [ ] **Overflow in `unchecked` blocks**: Code in `unchecked { }` has no overflow protection. A value wrapping from `type(uint256).max` to 0 or vice versa in unchecked code is a critical bug. Look for: every `unchecked` block, especially those with user-influenced values. [beirao M-10]

- [ ] **Downcast overflow**: Casting `uint256` to `uint128`, `uint64`, `uint32`, etc. silently truncates. Example: `uint32(amount)` where `amount > type(uint32).max` silently wraps. Look for: any explicit or implicit downcast, especially `uint32`, `uint64`, `uint128`. Use `SafeCast`. [ERC4626 primer pattern #20]

- [ ] **Negative-to-unsigned cast**: `uint256(negativeInt256)` creates a massive positive number in unchecked context, or reverts in checked context. When taking absolute value: must use `uint256(-negativeValue)` not `uint256(negativeValue)`. Look for: `uint256(signedVariable)` or `uint128(signedVariable)`. [ERC4626 primer pattern #66]

- [ ] **Signed-unsigned addition/subtraction overflow**: `int256 x + uint256 y` — if `y > type(int256).max`, this overflows. Look for: mixed signed/unsigned arithmetic. [ERC4626 primer pattern #55]

- [ ] **Overflow in time-based calculations**: `block.timestamp * rate` or `(endTime - startTime) * emissionRate` can overflow for large time differences or rates, especially with `int40`/`int64` types. Look for: time arithmetic with narrow types. [ERC4626 primer pattern #72]

## Decimal Handling

- [ ] **Oracle decimal mismatch**: Code assuming 8-decimal Chainlink feeds breaks with 6-decimal or 18-decimal feeds. Example: `price * 10**(18 - feed.decimals())` — correct for 8 decimals, wrong for 6 or 18. Look for: hardcoded decimal adjustments without querying `decimals()`. [ERC4626 primer pattern #26]

- [ ] **Token decimal mismatch in price calculations**: When computing value of `tokenA` in terms of `tokenB`, both token decimals AND oracle decimals must be normalized. A 6-decimal token priced by an 8-decimal oracle requires different scaling than an 18-decimal token. Look for: price calculations that don't normalize for both token and oracle decimals. [beirao V-04, Decurity CDP]

- [ ] **Decimal scaling for vault with non-18 decimal assets**: ERC4626 vaults with 6-decimal underlying tokens (USDC) need careful decimal scaling between shares (usually 18) and assets (6). Look for: hardcoded `1e18` in vault math when the underlying isn't 18 decimals. [ERC4626 checklist M6]

- [ ] **Zero/one remaining after division**: After fee deduction or precision scaling, a value of 1 wei may remain in the system. Over many operations, these round-to-1 remainders accumulate. Look for: fee calculations where `amount * fee / FEE_DENOMINATOR` always leaves ≥1 wei. [beirao V-06]

## Accumulator & Interest Math

- [ ] **Compounding when claiming simple interest**: If the interest accrual formula assumes simple interest but rewards/interest is claimed and re-deposited by users, the effective rate is higher than intended. Look for: interest rate formulas that don't account for compounding frequency. [ERC4626 primer]

- [ ] **Reward per token precision loss**: In staking reward contracts, `rewardPerToken = rewardRate * duration / totalStaked`. If `totalStaked` is very large relative to `rewardRate * duration`, this rounds to 0 and rewards are permanently lost. Look for: reward distribution math where the numerator can be smaller than the denominator. [Dacian]

- [ ] **Missing state update before reward claim**: If `_updateIntegrals()` isn't called before `_fetchRewards()`, all rewards accrued since the last update are lost. The fetch updates `lastUpdate` without capturing pending rewards. Look for: reward claim functions that don't update global state first. [ERC4626 primer pattern #17]

- [ ] **Fee shares minted after reward distribution**: If fee shares are minted AFTER rewards are distributed, the fee captures a portion of the rewards meant for existing holders. Must mint fee shares BEFORE distributing rewards. Look for: ordering of fee minting vs reward distribution. [ERC4626 primer pattern #9]

## Special Values

- [ ] **Division by zero returns 0 in assembly**: In Yul/inline assembly, `div(x, 0)` returns 0 instead of reverting. Look for: assembly division without prior zero-check on denominator. [beirao M-12]

- [ ] **`type(uint256).max` as sentinel value**: Using max-uint as "no limit" can cause overflow when added to anything. Look for: `type(uint256).max` used in calculations (not just comparisons). [weird-erc20]

- [ ] **Extreme weight ratios cause overflow**: In weighted pool math, `balance * (ratio ^ (1/weight))` overflows when weight is very small (e.g., 1.166%). Example: `7500e21 * (3.0 ^ 85.76) = OVERFLOW`. Look for: exponential calculations where the exponent can be very large. [ERC4626 primer pattern #73]

## Precision Loss Patterns (Expanded from Beirao/Tamjid)

- [ ] **Solidity time literals are uint24**: Expressions like `1 days`, `1 hours` are `uint24`. Operations involving these literals cast the result to `uint24`, which can overflow for large time calculations. `1 days * largeNumber` may silently truncate. Look for: arithmetic with Solidity time literals and large multipliers. [beirao M-04]

- [ ] **Rounding direction must favor the protocol**: In every division, the truncated remainder goes somewhere. In deposits: round shares DOWN (user gets fewer shares). In withdrawals: round assets DOWN (user gets fewer assets). In fee collection: round UP (protocol collects more). Getting this wrong lets users extract value. Look for: divisions in deposit/withdraw/fee paths without explicit rounding direction choice. [beirao M-06, ERC4626 Checklist M1]

- [ ] **Off-by-one in comparison operators**: `>` vs `>=`, `<` vs `<=` can mean the difference between allowing/blocking an action at the exact boundary. In liquidation: `healthFactor < 1.0` vs `healthFactor <= 1.0` determines if exactly-at-threshold positions are liquidatable. Look for: boundary conditions in health checks, auction timing, and threshold comparisons. [beirao M-11, Tamjid C22, C23]

- [ ] **Assigning negative value to uint reverts in Solidity >=0.8.0**: Even intermediate calculations can underflow. `uint a = 5; uint b = a - 10;` reverts. This can DoS functions where underflow was intentionally handled before 0.8.0. Look for: subtraction operations where the result could be negative but the type is unsigned. [beirao M-09]

- [ ] **`unchecked` blocks need explicit validation**: Unchecked blocks disable overflow/underflow checks for gas savings. Every unchecked block must have a proof that overflow/underflow is impossible or harmless. Look for: `unchecked` blocks without adjacent comments explaining why overflow is impossible. [beirao M-10, Tamjid C44]

- [ ] **Precision loss compounds across multiple operations**: A single division losing 1 wei is negligible. But if that result feeds into another division, and another, precision loss compounds exponentially. Look for: chains of divisions in multi-step calculations (e.g., reward distribution formulas with multiple intermediary divisions). [Tamjid C47]

---

## Dacian — Precision Loss Errors (Phase 3)

- [ ] **Division before multiplication hidden by function calls**: `wmul()` and `wdiv()` chaining can hide division-before-multiplication. Expand: `utilRate.wmul(slope1).wdiv(optimalUsageRate)` = `utilRate * (slope1/1e18) * (1e18/optimalUsageRate)` — the intermediate division causes precision loss. Fix: `utilRate * slope1 / optimalUsageRate`. [Source: Dacian — Precision Loss Errors, Yield VR Audit]

- [ ] **Rounding down to zero allows state changes without proper accounting**: If `decollateralized = loanCollateral * repaid / loanAmount` rounds to 0 for small repayments, the loan amount decreases but collateral stays unchanged. Repeated small repayments drain the loan while keeping all collateral. Fix: revert if decollateralized == 0. [Source: Dacian — Precision Loss Errors, Sherlock Cooler]

- [ ] **~50% value understatement from mixing precisions without scaling**: Adding `primaryBalance` (18 decimals) + `secondaryAmountInPrimary` (6 decimals) without first scaling the secondary token to primary precision causes a ~50% undervaluation of LP positions. [Source: Dacian — Precision Loss Errors, Sherlock Notional]

- [ ] **Excessive precision scaling — double-scaling already-scaled values**: When module A scales a token amount to 18 decimals, then passes it to module B which scales it again, the result is inflated by the scaling factor. Trace token amounts through the entire call path to verify they aren't re-scaled. [Source: Dacian — Precision Loss Errors, Sherlock Notional]

- [ ] **Mismatched precision scaling — decimals vs hardcoded 1e18**: If module A uses `token.decimals()` for precision and module B hardcodes `1e18`, tokens with non-18 decimals will have incorrect valuations when flowing between modules. [Source: Dacian — Precision Loss Errors, Code4rena Sublime/Yearn]

- [ ] **Downcast overflow silently invalidates pre-downcast invariant checks**: If `require(endTime > startTime)` passes with uint256 values, but `uint32(endTime)` overflows to 0 when endTime >= 2^32, the invariant is silently violated. Use OpenZeppelin's SafeCast for all downcasts. [Source: Dacian — Precision Loss Errors, Balancer Bug Bounty]

- [ ] **Rounding direction leaks value from protocol to traders**: In AMMs, `protocolFee` and `tradeFee` using `mulWadDown` (rounding down) lets traders pay slightly less than they should on every trade, leaking value. Fix: round fees up (`mulWadUp`). [Source: Dacian — Precision Loss Errors, Cyfrin SudoSwap Audit]
