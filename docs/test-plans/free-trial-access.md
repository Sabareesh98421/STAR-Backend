# Free trial access

## Access boundaries

- Public routes support signup, signin, OTP request/verification, and anonymous
  free trials. OTP stays public because email verification precedes signin.
- Private routes run the session middleware and reject requests without a valid
  session. Existing ensemble history and chat sockets are private.
- A URL locator never authenticates a user. Member trial access resolves the
  account from the session and verifies the locator belongs to that account.
- Guest locators are 32 lowercase hexadecimal characters. Member locators are
  the account UUID followed by `_` and the reversed trial-creation timestamp.
- Each guest trial has a separate three-prompt cap. Logged-in free accounts do
  not have a prompt-count cap.
- Guest trials and logged-in free accounts accumulate server-measured time from
  accepted run start to run settlement. Idle time is never counted. At two
  accumulated hours, new prompts are blocked for five hours; after cooldown the
  time allowance resets. Invalid prompts and turns refused because the shared
  browser is busy do not consume run time.
- An email listed in the insiders JSON receives its configured plan; enterprise
  insiders bypass the free-trial quota. Unlisted accounts remain on the free
  plan. Plan values are data, so adding tiers does not change route identity.
- One shared browser still permits only one active turn. Two tabs racing to
  submit cannot both start work or spend quota for a refused turn.

## Cases

- An unauthenticated request to a private route is rejected; signup, signin,
  OTP, and guest-trial routes remain reachable.
- A guest locator creates or opens only its own guest trial; malformed or
  member-shaped locators are rejected by the guest route.
- A member locator is usable only with the matching authenticated account.
  Guessing another member's locator, including one with a valid UUID prefix,
  never returns or changes that member's trial.
- The member identity comes from the session cookie, not an id in the URL.
- Insider plan matching is case-insensitive by email; an unlisted email cannot
  receive an insider plan by changing the URL.
- An enterprise insider can start beyond three prompts and still uses
  owner-scoped sessions.
- Three accepted prompts succeed for a guest; a fourth is refused across new
  chats, reloads, and duplicate tabs. Logged-in free accounts can exceed three
  prompts while below the time limit.
- Run durations accumulate across sessions; idle gaps between runs do not.
- Reaching two accumulated hours starts a five-hour cooldown, and a run already
  in progress is allowed to settle before the cooldown begins.
- After the cooldown expires, accumulated run time resets for the next cycle.
- A validation failure or shared-browser conflict consumes neither prompt
  allowance nor run time.
- Concurrent submissions cannot exceed the guest prompt cap or account time
  allowance.
- A disconnected socket can reconnect to the same trial without resetting its
  quota or starting a duplicate turn.
- Existing unowned chat sessions are not exposed through authenticated history
  or socket routes after the access boundary is enabled.

## Maps to

- API route specs for public/private router boundaries and session enforcement.
- Trial repository/service specs for locator ownership and atomic quota updates.
- WebSocket specs for owner checks, guest access, and duplicate-tab conflicts.
- Web route/transport specs for guest and authenticated trial locators.
- `apps/api/prisma/schema.prisma` and its forward migration for persisted trial
  identity, quota, and chat ownership.