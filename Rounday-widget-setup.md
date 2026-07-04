# Rounday Scriptable Widget

Rounday は PWA/HTML アプリなので、iOS の WidgetKit から `localStorage` を直接読むことはできません。
このため、Rounday から `rounday-widget.json` を書き出し、Scriptable のウィジェットがその JSON を読む方式にしています。

## Setup

1. iPhone に Scriptable を入れる。
2. `Rounday-widget.js` を Scriptable の新規スクリプトに貼り付ける。
3. Rounday の設定から `Widget JSON` を押して、`rounday-widget.json` を書き出す。
4. Files アプリで `rounday-widget.json` を `iCloud Drive/Scriptable/` に置く。
5. ホーム画面に Scriptable ウィジェットを追加し、スクリプトに `Rounday-widget` を指定する。

## Refresh

予定や TODO を変えたあとは、Rounday 側で `Widget JSON` を再度書き出して同じファイルを置き換えてください。
Scriptable のウィジェットは iOS の更新タイミングで再読み込みされます。

`rounday-widget.json` は `iCloud Drive/Scriptable/Rounday/` に置いても読めます。
