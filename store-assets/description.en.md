# Context Pilot

Use your own AI provider from Chrome's side panel to understand, summarize, and compare web pages you explicitly select.

Context Pilot supports OpenAI Chat Completions-compatible endpoints and Anthropic Messages. Ask about the current page or type `@` to select up to 10 open tabs for a source-numbered joint analysis. Pages are extracted again for every request so SPA routes and dynamic content stay current. If one selected page fails, analysis continues with the remaining pages.

Key features:

- Current-page summaries, key points, information lookup, and table analysis
- `@` tab selection, multi-page comparison, and traceable sources
- Streaming answers, stop generation, token usage, and local history restore
- Create, test, edit, and delete OpenAI-compatible and Anthropic profiles
- Bring your own API key, stored only in local browser storage

Privacy: page content and questions travel directly from the browser to the model endpoint configured by the user. The developer operates no relay server and does not receive API keys, page content, or conversations. Content is read only when the user asks a question and selects the relevant pages.
