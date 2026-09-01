# Chrome Web Store Privacy Practices

## Single purpose

Context Pilot lets users send content from web pages they explicitly select to an AI endpoint they configure, then displays the resulting analysis in Chrome's side panel.

## Data disclosures

- **Website content:** Yes. Visible text, headings, lists, tables, page title, and URL are processed only after the user initiates a question. Page bodies are not persisted.
- **Authentication information:** Yes. User-provided API keys are stored locally in `chrome.storage.local` with trusted-context access. They are sent only as provider authentication headers to the endpoint configured by the user.
- **User activity:** Page URLs and titles selected as sources are stored with local conversation history so a user can reopen a conversation.
- **Personal communications, location, health, financial/payment information:** Not collected by the developer.

## Transfer and use

Questions, selected website content, and necessary chat context are sent directly from the extension to the user's configured OpenAI-compatible or Anthropic origin. There is no developer-operated relay. The developer does not receive, sell, use for advertising, or use for credit decisions any user data. Use is limited to the extension's user-facing single purpose and complies with the Chrome Web Store Limited Use requirements.

## Retention and deletion

Website bodies are transient. Profiles and conversation history remain in local browser storage until the user deletes them, clears extension data, or uninstalls the extension. Individual profiles and conversations have in-product delete controls. The store listing must provide a real support contact before submission.

## Privacy policy hosting

`privacy-policy.zh-CN.md` is the source policy. It is not an assertion of a live policy URL. Before submission it must be hosted at a stable public HTTPS URL controlled by the publisher.
