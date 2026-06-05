# Online Compatibility Matrix

This table tracks how the local online mode maps existing offline game behavior onto the server-authoritative Socket.IO flow.

Server rule for online mode:

- Client sends a `GameAction` through `submitAction`.
- Server validates room membership, turn ownership, phase legality, and `stateVersion`.
- Server runs `gameReducer(room.gameState, action)`.
- Server increments `stateVersion`.
- Server sends each socket an individual `PlayerViewState`.
- Client renders only the received player view.

Client must not receive:

- Other players' real hand contents.
- Deck contents or deck order.
- Other players' detailed J-shield target cards.
- Full server `GameState`.

## Matrix

| Action/Feature | Offline source | Online status | Missing/Bug | Required server handling | Required PlayerViewState | Required UI action | Test needed |
| -------------- | -------------- | ------------- | ----------- | ------------------------ | ------------------------ | ------------------ | ----------- |
| `createRoom` | Online-only | Done | None known | Create room, host player, socket mapping | Room snapshot | Lobby create button | Playwright `online-start` |
| `joinRoom` | Online-only | Done | No reconnect support | Validate room and capacity | Room snapshot | Lobby join form | Playwright `online-start` |
| `ready` | Online-only | Done | Host is implicitly ready | Update player ready flag | Room snapshot | Ready button | Playwright `online-start` |
| `startGame` | `createInitialGame` | Done | CPU seats not supported online | Host-only, all guests ready, create full state | Player-specific starting view | Start Game button | Playwright `online-start` |
| Initial deck count | `deck.ts dealCards` | Done | Must not regress to 64 | Keep full deck at 104 after initial hands | `deckRemaining: 104`, `deck: []` | Deck count display | Playwright + smoke |
| `drawFromDeck` | `gameState.ts case "drawFromDeck"` | Done for normal turn | Effects/reach variants later | Validate current player, phase `draw`, version; run reducer | Actor gets real `drawnCard`; others get `drawnCard: null`; `deckRemaining` decrements | Draw button, drawn preview | Playwright `online-turn`, smoke |
| Draw animation | `PlayScreen animateDrawFromDeck` | Done | Keep offline behavior intact | Server decides card; client only animates received actor card | Actor-only `drawnCard` | `drawn-card-preview` then hand insertion | Playwright online/offline regression |
| `discard` | `gameState.ts case "discard"` | Done for normal turn | Effects/reach variants later | Validate current player, phase `discard`, card in actor hand; run reducer | Public discard piles for all players | Select hand card, discard button | Playwright `online-turn`, smoke |
| Turn handoff after discard | `advanceToNextDraw` + `confirmHandoff` | Done minimal | Manual handoff UI bypassed online | If normal discard reaches `handoff`, server auto-confirms | New current player, phase `draw` | Next player draw button | Playwright `online-turn`, smoke |
| `takeDiscard` | `gameState.ts case "takeDiscard"` | Partial | Needs broader call/pass UX and tests | Validate current player, phase `draw`, legal discard source, legal meld; run reducer | Own hand, public discards/openMelds; current UI computes call options from view | Call button | Smoke currently; add Playwright `online-call` |
| Call pass | Offline implicit draw choice | Missing | No explicit online pass action beyond draw | Treat `drawFromDeck` as pass over call options | Available draw action | Draw button | Add Playwright call-pass case |
| `winWithDiscard` | `gameState.ts case "winWithDiscard"` | Missing | Not enabled online | Validate current player, phase `discard`, winning discard candidate | Winning discard candidates actor-only | Win button | Add online ron/tsumo tests |
| `answerRon` | `gameState.ts case "answerRon"` | Missing | Ron confirm not wired online | Validate pending ron result and eligible winner | Ron candidates only to eligible players | Ron accept/pass buttons | Add Playwright `online-ron` |
| `declareReach` | `gameState.ts case "declareReach"` | Missing | Reach declaration not wired online | Validate current player and reach eligibility | Reach eligibility actor-only | Reach button | Add reach tests |
| `answerReachAfterDiscard` | `gameState.ts case "answerReachAfterDiscard"` | Missing | Reach confirmation not wired online | Validate phase `reachConfirm` and actor | Reach confirm pending actor-only | Confirm buttons | Add reach tests |
| `discardDrawnOnly` | `gameState.ts case "discardDrawnOnly"` | Missing | Needed for reach | Validate reach player, drawn card only | Drawn card actor-only | Discard drawn button | Add reach tests |
| `answerDaifugoEffect` | `gameState.ts case "answerDaifugoEffect"` | Missing | Effect confirm not wired online | Validate pending effect owner | Pending effect actor-only | Effect yes/no buttons | Add effect tests |
| `discardForDaifugoEffect` | `gameState.ts case "discardForDaifugoEffect"` | Missing | Needed for 8/10 | Validate pending extra discard and candidate card | Candidate cards actor-only | Extra discard button | Add 8/10 tests |
| `drawForDaifugoEffect` | `gameState.ts case "drawForDaifugoEffect"` | Missing | Needed for 8/10/Q refill | Validate pending draw owner/effect | Actor-only drawn cards when visible | Effect draw flow | Add effect tests |
| 5 effect | `applyDaifugoEffect` / `resolveNormalFiveSkip` | Missing | Not online-enabled | Validate confirm and run reducer | Pending/effect result, next turn | Effect confirm | Add effect tests |
| 7 effect | `startSevenExchange` / `resolveSevenExchange` | Missing | Not online-enabled | Validate selections from both players | Candidate cards only to selecting player | Exchange card picker | Add effect tests |
| 8 effect | `applyDaifugoEffect` + extra discard | Missing | Not online-enabled | Validate effect flow and extra discard | Actor-only draw/discard candidates | Effect draw/discard UI | Add effect tests |
| 9 effect | `applyDaifugoEffect` reverse | Missing | Not online-enabled | Validate confirm and direction change | Direction public | Effect confirm | Add effect tests |
| 10 effect | `applyDaifugoEffect` + extra discard/draw | Missing | Not online-enabled | Validate effect flow | Actor-only extra discard/draw | Extra discard UI | Add effect tests |
| J inspect | `resolveJackSpecialEffect` | Missing | Not online-enabled | Validate selection and reveal only allowed cards | Revealed cards actor-only | Inspect UI | Add J tests |
| J shield | `resolveJackShieldEffect` / run effect | Missing | Not online-enabled | Validate shield target from actor hand | Own shield detail only; public shield status only | Shield target UI | Add J tests |
| Q vanish | `resolveQueenNumberVanish` | Missing | Not online-enabled | Validate selected rank and refill | Own discarded/drawn card details only; public counts | Queen rank UI | Add Q tests |
| Deckout | `deckoutResult` | Missing online test | May work through reducer but not verified | Allow reducer result and broadcast | Public result | Result UI | Add deckout test |
| Round end | `matchState.ts` | Missing online | Match flow not online-enabled | Server-side match state needed | Round result view | Next round UI | Add round tests |
| Score calculation | `scoring.ts` | Missing online test | Single-game result not fully wired online | Use existing scoring through reducer/result | Public result; hidden hands safe | Result UI | Add result tests |
| CPU strategy | `cpuModel*` | Not planned for current online | Online rooms are all-human | Future server-side CPU actor only | CPU public state only | None now | Add future CPU tests |
| Simulator parity | `src/sim/*` | Not online-related | Keep reducer behavior unchanged | No online dependency | N/A | N/A | Existing sim tests |
| `stateVersion` | Online-only | Done Phase 1 | Extend to all future actions | Reject stale actions | Included in every player view | Hidden/debug | Smoke, security tests |
| `actionRejected` | Online-only | Done basic | Better UI surface later | Send reason and latest view | Reason/event to actor | Console warning for now | Smoke; add Playwright security |
| `availableActions` | Online-only | Partial | Needs structured candidates | Compute from full state safely | Current string list | Controls visibility | Start/turn E2E |
| Hidden hand protection | `createPlayerViewState` | Partial | Add explicit tests for all effect reveals | Mask non-viewer hands and J details | Own hand only; others masked by count | Existing UI | Playwright + future unit tests |
| Hidden deck protection | `createPlayerViewState` | Done Phase 1 | Keep through effects | Send `deck: []`, `deckRemaining` only | No deck contents/order | Deck count only | Playwright + smoke |

## Implementation Phases

### Phase 1: Normal Turn

Status: Done and covered by Playwright/smoke.

- Deck starts at 104.
- `drawFromDeck` decrements to 103.
- Actor-only drawn card preview matches the card added to hand.
- Other players do not see drawn card contents.
- `discard` publishes discard information.
- Server auto-advances online normal discard from `handoff` to next player's `draw`.
- `stateVersion` increments.
- Stale/wrong-turn actions are rejected in smoke coverage.

### Phase 2: Call/Ron Reactions

Status: Started.

- `takeDiscard` server validation exists.
- Open melds are broadcast through player views.
- Needs Playwright `online-call`.
- Needs call pass, ron candidates, `answerRon`, `winWithDiscard`, double ron coverage.

### Phase 3: Reach

Status: Missing.

- Add `declareReach`, reach confirm, reach drawn-only discard, reach ron confirm.

### Phase 4: Daifugo Effects

Status: Missing.

- Add 5/7/8/9/10/J/Q flows, actor-only candidates, shield privacy, Q refill privacy, extra discard flows.

### Phase 5: Round/Result

Status: Missing.

- Add deckout, result, score, round transition, match-state ownership on the server.
