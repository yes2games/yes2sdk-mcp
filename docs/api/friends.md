# Friends — `Yes2SDK.friends`

[← Back to overview](overview.md)

Paginated list of the player's friends who also play this game. Available on **CrazyGames** today.

---

## Methods (Core)

| Signature | Description |
|-----------|-------------|
| `listFriendsAsync(page: number, size: number): Promise<FriendsResult>` | List friends. `page` is a non-negative 0-based integer; `size` a positive integer. |
| `isSupported(): boolean` | Whether friends is supported. |

**Types:** `Friend = { id: string; name: string; profilePictureUrl? }`; `FriendsResult = { friends: Friend[]; hasMore: boolean }`.

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|
| `listFriendsAsync` | — | — | Ready¹ | — | — |
| `isSupported` | — | — | Ready | — | — |

¹ CrazyGames `sdk.user.getMyFriends()`, paginated in memory. Throws `FEATURE_NOT_SUPPORTED` only if the SDK version lacks the method.

---

## Unity (C#)

`Yes2SDK.Friends`.

| Signature | Description |
|-----------|-------------|
| `void ListFriendsAsync(int page, int size, Action<FriendsPage> onSuccess = null, Action<Error> onError = null)` / `Task<FriendsPage> …(CancellationToken)` | |
| `bool IsSupported()` | Editor: false. |

`FriendInfo` (struct): `Id`, `Username`, `ProfilePictureUrl`. `FriendsPage` (struct): `Friends`, `Page`, `Size`, `HasMore`, `Total`.

---

## Defold (Lua)

| Signature | Description |
|-----------|-------------|
| `yes2sdk.friends_list_friends(page, size, callback)` | `callback(self, success, page_json)` where `page_json` = `{"friends":[{"username","id"}],"hasMore":bool}`. |
| `yes2sdk.friends_is_supported()` | Boolean (default `false`). |
