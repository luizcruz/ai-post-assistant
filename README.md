# AI Post Assistant

WordPress plugin that adds an AI-powered panel to the Gutenberg editor sidebar with four on-device AI tools:

| Button | What it does |
|---|---|
| **✨ IA Títulos** | Generates 3 SEO-optimised title suggestions (≤ 65 chars) using Chrome's `LanguageModel` API. |
| **✨ IA Resumo** | Generates a PT-BR summary using Chrome's `Summarizer` + `Translator` APIs. |
| **✨ IA Links** | Scans paragraph blocks and inserts up to N anchor links per keyword from a configurable list. |
| **✨ IA Tags** | Extracts the 5 most relevant tags from the article text and inserts them directly into the Gutenberg Tags field. |

Each button is shown only when its feature toggle is enabled in **Configurações → AI Post Assistant**. Disabled features are hidden — the section title and its configuration fields also disappear from the settings page.

Pipelines run **on-device via Chrome's experimental AI APIs** by default. An optional **OpenAI fallback** can be enabled in settings so the plugin works in browsers without Gemini Nano — the API key is stored server-side and never sent to the browser.

---

## Requirements

### Browser
Chrome ≥ 127 with the following flags enabled at `chrome://flags`:

| Flag | Value |
|---|---|
| `#optimization-guide-on-device-model` | Enabled BypassPerfRequirement |
| `#prompt-api-for-gemini-nano` | Enabled |
| `#summarization-api-for-gemini-nano` | Enabled |
| `#translation-api-without-language-pack-limit` | Enabled |

After enabling the flags, open `chrome://components` and trigger a manual update for **Optimization Guide On Device Model** to download Gemini Nano.

> **No Chrome flags required when OpenAI fallback is enabled.** The plugin will skip on-device models and call OpenAI directly.

### Server
| Requirement | Minimum |
|---|---|
| WordPress | 6.3 |
| PHP | 8.1 |
| Node.js | 20 |
| Composer | 2 |

---

## Installation

1. Clone or download this repository into `wp-content/plugins/`:
   ```bash
   cd wp-content/plugins/
   git clone git@github.com:luizcruz/ai-post-assistant.git
   ```

2. Install JS dependencies and build the editor bundle:
   ```bash
   cd ai-post-assistant
   npm install
   npm run build
   ```

3. Activate the plugin in **WordPress Admin → Plugins**.

4. Open any post in the Gutenberg editor. The **✨ AI Post Assistant** panel appears in the right sidebar.

---

## Admin settings

Go to **Configurações → AI Post Assistant** to customise all plugin behaviour.

> When a feature is **disabled**, its toggle row hides the corresponding configuration section on the same page — no need to scroll past settings for features you are not using.

### Recursos ativos
Toggle each feature on or off independently. Disabled buttons are hidden in the editor sidebar.

| Toggle | Default | Description |
|---|---|---|
| ✨ IA Títulos | On | Show/hide the title suggestion button |
| ✨ IA Resumo | On | Show/hide the excerpt summary button |
| ✨ IA Links | On | Show/hide the keyword link injection button |
| ✨ IA Tags | On | Show/hide the tag extraction button |

### IA Resumo – Summarizer API

| Setting | Options | Default | Description |
|---|---|---|---|
| Tipo de resumo | `tldr`, `key-points`, `headline` | `tldr` | Strategy passed to `Summarizer.create()` |
| Formato de saída | `plain-text`, `markdown` | `plain-text` | Output format of the raw summary |
| Comprimento | `short`, `medium`, `long` | `short` | Verbosity of the generated summary |

### IA Títulos – Prompt

Free-text prompt sent to Chrome's `LanguageModel`. Use `{{context}}` as the placeholder for the article body (capped at 4 000 characters).

### IA Tags – Prompt

Free-text prompt sent to Chrome's `LanguageModel`. Use `{{context}}` as the placeholder for the article body (capped at 3 000 characters). The model should return tags separated by commas.

### IA Links

| Setting | Default | Description |
|---|---|---|
| Máximo de links por palavra-chave | `2` | How many times the same keyword can be linked in a single article (1–10) |
| Lista de links (JSON) | *(plugin default)* | JSON array of `{ "url": "...", "keywords": ["..."] }` objects. Leave empty to use the built-in list of 37 Brazilian sports keywords. |

**JSON format example:**
```json
[
  { "url": "https://lance.com.br/flamengo",   "keywords": ["Flamengo"] },
  { "url": "https://lance.com.br/palmeiras",  "keywords": ["Palmeiras"] },
  { "url": "https://lance.com.br/tudo-sobre/copa-libertadores", "keywords": ["Copa Libertadores", "Libertadores"] }
]
```
Keywords within each entry are tried **most-specific first**, so `"Santos FC"` is matched before `"Santos"` to avoid the shorter term consuming both link slots when the longer form is present.

### Fallback OpenAI

When on-device Chrome APIs are unavailable or fail, the plugin can fall back to OpenAI's Chat Completions API. The API key is stored server-side via WordPress options and **never sent to the browser**.

| Setting | Default | Description |
|---|---|---|
| Fallback OpenAI toggle | Off | Enable/disable the fallback globally |
| Chave de API (OpenAI) | *(empty)* | Your `sk-…` OpenAI key; leave blank on save to keep the existing key |
| Modelo OpenAI | `gpt-4o-mini` | Model used for all three AI pipelines (`gpt-4o-mini`, `gpt-4o`, `gpt-3.5-turbo`) |

> The API key and model selector are hidden in the settings page when the fallback toggle is off.

---

## How it works

### IA Títulos flow
1. Reads all `core/paragraph` blocks (≥ 6 words each) from the Gutenberg store.
2. Sends the text (+ the configured prompt) to `LanguageModel.create()`, or to OpenAI if the fallback is enabled and Chrome AI is unavailable.
3. A modal opens immediately with up to 3 generated titles — click one to apply it to the post title field.

### IA Resumo flow
1. Reads paragraph blocks as above.
2. Calls `Summarizer.create()` with the configured `type / format / length`.
3. Translates the English summary to Portuguese via `Translator.create({ sourceLanguage:'en', targetLanguage:'pt' })`.
4. Falls back to a single OpenAI prompt that produces a Portuguese summary directly if Chrome APIs are unavailable.
5. A modal opens with the result — click to apply it to the post excerpt field.

### IA Links flow
1. Reads the active link map (admin JSON or built-in list) and the `maxPerKeyword` setting.
2. Counts links already present in the editor so re-clicking stays idempotent.
3. Uses DOM-based text-node walking (no raw-HTML regex) to inject `<a>` tags, respecting existing anchors to prevent nesting.
4. Applies changes directly to the affected blocks via `updateBlockAttributes()`.

### IA Tags flow
1. Reads paragraph blocks (≥ 6 words each) from the Gutenberg store.
2. Sends the text (+ the configured tags prompt) to `LanguageModel.create()`, or to OpenAI if the fallback is active.
3. Parses the comma-separated response into up to 5 tag strings.
4. Opens the Gutenberg document sidebar, locates the **Tags** panel (expanding it if collapsed), and inserts each tag as a token by simulating the native input + Enter-keydown sequence that Gutenberg's `FormTokenField` uses internally.
5. Focuses the tags input so the user can review or add more tags.

---

## Development

### Start the dev server (watch mode)
```bash
npm run start
```
The bundle is rebuilt on every file save. Reload the editor page to pick up changes.

### Project structure
```
ai-post-assistant/
├── ai-post-assistant.php          # Plugin bootstrap, settings page (PHP)
├── build/                         # Compiled assets (generated — not committed)
├── src/
│   ├── index.js                   # Registers the single PluginDocumentSettingPanel
│   ├── components/
│   │   ├── AIAssistantPanel.jsx   # Consolidated panel: 4 stacked action buttons
│   │   └── SelectionModal.jsx     # Auto-generating modal for titles / resumo
│   └── utils/
│       ├── aiHelper.js            # Chrome AI pipelines + OpenAI fallback + sanitizeAIText
│       ├── linkInjector.js        # DOM-based keyword link injector (idempotent)
│       └── linkKeywords.js        # Built-in keyword→URL map + getActiveLinkMap()
├── tests/
│   ├── js/                        # Jest + React Testing Library
│   └── php/                       # PHPUnit + Brain/Monkey
└── ...
```

---

## Running the tests

### Setup (once)
```bash
npm install       # JS dependencies (Jest, RTL, @wordpress/scripts…)
composer install  # PHP dependencies (PHPUnit, Brain/Monkey)
```

### JavaScript — Jest + React Testing Library

| Goal | Command |
|---|---|
| All tests | `npm run test:js` |
| Single file | `npm run test:js -- tests/js/aiHelper.test.js` |
| Single test by name | `npm run test:js -- -t "strips HTML tags"` |
| Watch mode | `npm run test:js -- --watch` |
| Coverage report | `npm run test:js -- --coverage` |

### PHP — PHPUnit + Brain/Monkey

| Goal | Command |
|---|---|
| All tests | `./vendor/bin/phpunit` |
| Verbose (test names) | `./vendor/bin/phpunit --testdox` |
| Single test class | `./vendor/bin/phpunit --filter AiPostAssistantTest` |
| Single test method | `./vendor/bin/phpunit --filter test_returns_false_when_user_lacks_edit_posts_capability` |

Test file: `tests/php/AiPostAssistantTest.php` — covers `is_valid_edit_screen()` and `enqueue_editor_assets()` under 12 scenarios (capability check, screen type, asset-file guard, happy path).

---

## Security model

| Layer | Mechanism |
|---|---|
| Script loading | `current_user_can('edit_posts')` + block-editor screen check before any JS is enqueued |
| Settings page | `current_user_can('manage_options')` + Settings API nonce + per-field sanitizers (allowlist for selects, `sanitize_textarea_field` for text, JSON structural validation for the link map) |
| CSRF baseline | `wp_create_nonce` localised to JS via `wp_localize_script` |
| OpenAI proxy | AJAX handler validates nonce + `edit_posts` capability; checks that fallback is enabled and a key is configured before calling OpenAI; API key is never sent to the browser |
| AI output (render) | React renders suggestion strings as text nodes — `dangerouslySetInnerHTML` is absent from the entire codebase |
| AI output (store) | `sanitizeAIText()` strips `<script>`, `<style>`, all HTML tags and control characters before `editPost()` is called |
| Link injection | DOM-based text-node walking ensures no raw HTML is mutated by string replacement; existing `<a>` elements are never descended into |
