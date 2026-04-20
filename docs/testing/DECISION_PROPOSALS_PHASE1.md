# Decision Proposals Phase 1 — Test Plan

Branch: `feat/decision-proposals`
Deploy: alpha (alpha.tandemgtd.com)

## Prerequisites
- Two team members on a shared team (e.g. Jason + Edward)
- At least one team project with decisions enabled

---

## 1. APPROVAL Decisions (Backwards Compat)

- [ ] Create an APPROVAL decision from the project detail page — should work exactly as before
- [ ] Respondent sees it on Do Now page with vote icon
- [ ] Respondent can approve/reject/comment/defer
- [ ] Requester can resolve with resolution text
- [ ] WaitingFor auto-resolves on resolution

## 2. Create a POLL Decision (UI)

- [ ] Open "Request Decision" dialog on a team project/task
- [ ] Toggle from "Decision" to "Quick Poll" — UI switches to show option builder
- [ ] Add 3 options (e.g. "Option A", "Option B", "Option C")
- [ ] Try to submit with only 1 option — button should be disabled
- [ ] Remove an option (X button) — can't go below 2
- [ ] Add more options with "+ Add option"
- [ ] Submit poll with question + 3 options + respondents
- [ ] Verify poll appears with bar chart icon (not vote icon)
- [ ] Verify "Poll" badge shows on the card

## 3. Vote on a Poll

- [ ] As a respondent, see the poll on the Do Now page
- [ ] Badge shows "0/N voted"
- [ ] Click into the poll — see OptionVoteBars for each option
- [ ] Click an option to vote — bar fills, checkmark appears, your name shows under option
- [ ] Click a different option — vote switches (old vote removed, new one added)
- [ ] Verify vote count updates: "1/N voted"
- [ ] As a second respondent, vote on a different option — both votes visible

## 4. Resolve a Poll

- [ ] As the requester, click "Resolve" on an open poll
- [ ] "Chosen option" dropdown appears — select one of the options
- [ ] Enter resolution text and click Resolve
- [ ] Verify resolution shows with "Chosen: [option label]" in green
- [ ] Status changes to RESOLVED
- [ ] WaitingFor auto-resolves
- [ ] Voting buttons become disabled

## 5. Pending Decisions (Do Now Page)

- [ ] Both APPROVAL and POLL decisions appear in the pending section
- [ ] APPROVAL shows vote icon, POLL shows bar chart icon
- [ ] "Poll" badge appears for poll decisions
- [ ] Vote count is correct for both types
- [ ] After voting, the decision disappears from pending list

## 6. MCP Tools (via Claude)

- [ ] `tandem_decision_create` with `decisionType: "POLL"` and `options` array — creates poll
- [ ] `tandem_decision_vote_option` with `decisionId` and `optionId` — casts vote
- [ ] `tandem_decision_vote_option` again with different `optionId` — changes vote
- [ ] `tandem_decision_resolve` with `chosenOptionId` — resolves with chosen option
- [ ] `tandem_decision_list_pending` — shows both types, filters correctly
- [ ] `tandem_decision_create` without `decisionType` — defaults to APPROVAL (existing behavior)

## 7. Edge Cases

- [ ] Create a poll, then try to use APPROVAL voting (approve/reject) — should not be possible via UI
- [ ] Non-respondent tries to vote on poll — should be blocked
- [ ] Vote on a resolved poll — should be blocked (disabled buttons)
- [ ] Create APPROVAL decision via MCP with no `decisionType` — works as before
- [ ] Create POLL with only 1 option — should fail validation

## 8. Migration

- [ ] On alpha: migration runs cleanly (`npx prisma migrate deploy` or `prisma db push`)
- [ ] Existing APPROVAL decisions are unaffected (decisionType defaults to APPROVAL)
