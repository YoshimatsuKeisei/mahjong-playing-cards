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
| Tsumo / self draw win | `gameState.ts case "winWithDiscard"` + `rules.ts findWinningDiscardsAfterDraw` | Implemented Phase 1.5 | Needs broader regression scenarios | Validate actor is current player, phase `discard`, and chosen discard is a legal winning discard; run reducer | Actor-only `canTsumo`, `canSelfWin`, `winningDiscardOptions`; result public after win | `tsumo-button` sends `winWithDiscard` | Playwright `online-tsumo` |
| Draw-after-win candidates | `findWinningDiscardsAfterDraw` | Implemented Phase 1.5 | None known | Compute from full server state only | Actor-only candidate list and summary | Candidate buttons | Playwright `online-tsumo` |
| Reach tsumo | `getReachWinningOptions`, `discardDrawnOnly`, `winWithDiscard` | Implemented Phase 1.5 | Existing offline reducer requires discard choice to finalize win | Validate reach player, legal winning discard, or legal drawn-only discard if no win | Actor-only winning candidates or `discardDrawnOnly` action | `tsumo-button` / drawn-only discard button | Playwright `online-reach-tsumo` |
| 8/10 refill tsumo | `drawForDaifugoEffect`, `discardForDaifugoEffect`, `winWithDiscard` | Partially implemented Phase 1.5 | Full 8/10 effect UX still broader Phase 4 | Allow pending effect owner actions and legal winning discard | Pending effect only visible to involved player; actor-only win candidates | Existing effect draw/discard panel | Add 8/10 effect tests |
| Q refill tsumo / Q after-effect win | `selectQueenVanishRank`, `answerQueenWin` | Implemented for Q after-draw win path | Full Q UX/security still broader Phase 4 | Validate pending Q owner, selected rank, and `answerQueenWin`; run reducer | Q pending only to actor; Q event cards masked per viewer | Queen rank buttons; auto answer after animation | Playwright `online-q-after-draw-tsumo` |
| Draw animation | `PlayScreen animateDrawFromDeck` | Done | Keep offline behavior intact | Server decides card; client only animates received actor card | Actor-only `drawnCard` | `drawn-card-preview` then hand insertion | Playwright online/offline regression |
| `discard` | `gameState.ts case "discard"` | Done for normal turn | Effects/reach variants later | Validate current player, phase `discard`, card in actor hand; run reducer | Public discard piles for all players | Select hand card, discard button | Playwright `online-turn`, smoke |
| Turn handoff after discard | `advanceToNextDraw` + `confirmHandoff` | Done minimal | Manual handoff UI bypassed online | If normal discard reaches `handoff`, server auto-confirms | New current player, phase `draw` | Next player draw button | Playwright `online-turn`, smoke |
| `takeDiscard` | `gameState.ts case "takeDiscard"` | Implemented Phase 2 | Wider UI polish later | Validate current player, phase `draw`, legal discard source, legal meld; run reducer | Viewer-only `reaction.callCandidates`; public openMelds after call | `call-button` | Smoke + Playwright `online-call` |
| Call / 鳴き | `getAvailableDiscardSources`, `getCallOptionsForSource`, `rules.ts findCallMeldOptions` | Implemented Phase 2 | Only next-player call per existing rules | Server computes legal source/meld from full state | Caller-only call candidates with source discard and meld payload | Call button sends `takeDiscard` | Playwright `online-call` |
| Call pass | Offline implicit draw choice | Implemented Phase 2 | No separate reducer action; pass is `drawFromDeck` | Treat `drawFromDeck` as pass over call options | `passReaction` available action; draw remains legal | Pass button sends `drawFromDeck` | Playwright `online-call-pass` |
| Ron candidate | `makeReachRonResult`, `findReachRonResults` | Implemented Phase 2 | Only reach ron per existing reducer | After discard, reducer enters `ronCheck`; server sends candidate views only to eligible players | Candidate-only `pendingRonResult` and `reaction.ronCandidates` | Ron overlay | Playwright `online-ron` |
| `answerRon` | `gameState.ts case "answerRon"` | Implemented Phase 2 | Existing reducer handles all candidates together | Validate sender is one of `pendingRonResult.ronResults`; run reducer | Candidate-only ron data; public result after win | Ron / Pass buttons | Playwright `online-ron` |
| `winWithDiscard` | `gameState.ts case "winWithDiscard"` | Implemented Phase 1.5 | Name covers tsumo after deck draw and ron after discard take | Validate legal winning discard option | Actor-only winning options | Tsumo/win button | Playwright tsumo/reach |
| Wロン | `makeReachRonResult` `ronResults[]` | Implemented Phase 2 using existing offline aggregate answer | Existing reducer resolves all listed ron winners when accepted | Validate at least one eligible responder; preserve all `ronResults` | Eligible players see Ron; result public includes multiple winners | Ron button | Playwright `online-double-ron` |
| Discard reaction wait | `advanceToNextDraw` + `ronCheck` | Implemented Phase 2 | No simultaneous per-player pass state beyond existing reducer | Auto-confirm handoff online when no pending reaction/effect remains | Current phase/message, candidate-only reaction | Draw/call/ron/pass controls | Playwright call-pass/ron |
| `winWithDiscard` | `gameState.ts case "winWithDiscard"` | Missing | Not enabled online | Validate current player, phase `discard`, winning discard candidate | Winning discard candidates actor-only | Win button | Add online ron/tsumo tests |
| `answerRon` | `gameState.ts case "answerRon"` | Missing | Ron confirm not wired online | Validate pending ron result and eligible winner | Ron candidates only to eligible players | Ron accept/pass buttons | Add Playwright `online-ron` |
| Reach candidate / リーチ候補 | `rules.ts canDeclareReachAfterDraw` | Implemented Phase 3 | None known | Compute eligibility from full server state only | Actor-only `canReach` and `availableActions: declareReach` | `reach-button` | Playwright `online-reach-declare` |
| `declareReach` / リーチ宣言 | `gameState.ts case "declareReach"` | Implemented Phase 3 | None known | Validate current player, phase `discard`, drawn-from-deck, not called, not already reached, and reach eligibility | Public `player.isReach`; actor-only candidate before declaration | Reach button sends `declareReach` | Playwright `online-reach-declare` |
| Reach state public view | `Player.isReach` | Implemented Phase 3 | None known | Preserve public reach flag in all player views | `players[].isReach`, status label/data attr; masked hands remain masked | Public seat status | Playwright `online-reach-declare` |
| Reach hand lock | `gameState.ts discard guards` | Implemented Phase 3 | Explicit online reject reasons added | Reject normal `discard` while reached and not declared this turn | `discardDrawnOnly` only when applicable | Hide normal discard path; server rejects direct action | Playwright `online-reach-invalid-discard` |
| Reach draw | `gameState.ts case "drawFromDeck"` | Implemented Phase 3 | None known | Validate current reach player, phase `draw`, version; run reducer | Actor-only drawn card; public deck count | Draw button | Playwright reach draw tests |
| Reach tsumo | `getReachWinningOptions`, `getWinningDiscardOptions`, `winWithDiscard` | Implemented Phase 3 | Existing reducer finalizes via discard choice | Validate legal winning discard option | Actor-only `winningDiscardOptions` / `canTsumo` | `tsumo-button` | Playwright `online-reach-draw-tsumo` |
| `discardDrawnOnly` | `gameState.ts case "discardDrawnOnly"` | Implemented Phase 3 | None known | Validate reach player, drawn card exists, no winning option, not declaration turn | Actor-only `availableActions: discardDrawnOnly`; drawn card visible only to actor | `discard-drawn-only-button` | Playwright `online-reach-discard-drawn-only` |
| Reach discard restriction | `gameState.ts case "discard"` | Implemented Phase 3 | None known | Reject direct normal discard with `reach_hand_locked` or `discard_drawn_only_required` | Latest safe player view after reject | Console/actionRejected | Playwright `online-reach-invalid-discard` |
| Reach call restriction | `getAvailableDiscardSources`, `getCallOptionsForSource` | Implemented Phase 3 | None known | Do not create call candidates for reached player; reject direct `takeDiscard` with `reach_player_cannot_call` | No call candidates for reached viewer | No call button | Playwright `online-reach-cannot-call` |
| Reach ron check | `makeReachRonResult`, `answerRon` | Implemented Phase 3 via Phase 2 | None known | After reach discard, keep `ronCheck` if candidates exist; validate eligible responder | Candidate-only Ron view | Ron button | Playwright `online-reach-discard-ron` |
| Reach after discard reaction | `discardDrawnOnly` -> `advanceToNextDraw` / `ronCheck` | Implemented Phase 3 | None known | Auto-confirm handoff only when no pending reaction/effect remains | Public discard pile and current phase | Ron/pass or next draw | Playwright `online-reach-discard-ron`, discard-drawn-only |
| Reach round end | `winWithDiscard`, `answerRon`, scoring | Implemented Phase 3 via existing result flow | None known | Preserve existing result scoring and Wロン behavior | Public result; hidden hands masked | Result screen | Playwright reach tsumo/ron |
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

### Phase 1.5: Tsumo After Draw

Status: Implemented.

- Actor-only `winningDiscardOptions` are generated from server full state.
- `winWithDiscard` is accepted online only when the chosen discard is a legal winning discard.
- Reach tsumo and drawn-only reach discard are server-validated.
- Q after-effect win is accepted through the existing `answerQueenWin` reducer path.
- Other players do not receive the actor's hand, deck, or drawn-card contents.

### Phase 2: Call/Ron Reactions

Status: Implemented on top of the existing offline reducer model.

- `takeDiscard` server validation exists and rejects illegal source/meld pairs.
- Open melds are broadcast through player views.
- Call pass uses the existing offline choice of drawing from the deck instead of taking the discard.
- Ron candidates are visible only to eligible reach players.
- `answerRon` is accepted only from eligible ron candidates.
- Wロン uses the existing aggregate `pendingRonResult.ronResults` behavior.
- Needs continued UI polish beyond the dev/test controls.

### Phase 3: Reach

Status: Implemented.

- `canReach` and `declareReach` are actor-only before declaration.
- `player.isReach` is public after declaration.
- Reach hand lock is enforced on the server, including direct invalid `discard` rejection.
- Reach draw branches into `winWithDiscard` candidates or `discardDrawnOnly`.
- Reached players cannot call; direct `takeDiscard` is rejected.
- Reach discards feed the existing Phase 2 ron/Wロン flow.

### Phase 4: Daifugo Effects

Status: Partial.

- Q after-effect win path is included in Phase 1.5.
- Full 5/7/8/9/10/J/Q online effect coverage remains future work.

### Phase 5: Round/Result

Status: Missing.

- Add deckout, result, score, round transition, match-state ownership on the server.
