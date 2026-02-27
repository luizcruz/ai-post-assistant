# AI Post Assistant

WordPress plugin that adds two AI-powered buttons to the Gutenberg sidebar:

- **✨ IA Títulos** — generates 3 SEO-optimised title suggestions (≤ 65 chars) using Chrome's on-device `LanguageModel` API.
- **✨ IA Resumo** — generates a key-points summary in PT-BR using Chrome's `Summarizer` + `Translator` APIs.

Both pipelines run entirely on-device. No data leaves the browser and no external API key is required.

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

After enabling the flags, open `chrome://components` and trigger a manual update for **Optimization Guide On Device Model** so Gemini Nano is downloaded.

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

4. Open any post in the Gutenberg editor. The **✨ IA Títulos** and **✨ IA Resumo** panels appear in the right sidebar.

---

## Development

### Start the dev server (watch mode)
```bash
npm run start
```
The bundle is rebuilt on every file save. Reload the editor page to pick up changes.

### Project structure
```
src/
  index.js                  # registers both PluginDocumentSettingPanel slots
  components/
    TitlesPanel.jsx          # trigger button for title generation
    ResumoPanel.jsx          # trigger button for excerpt generation
    SelectionModal.jsx       # shared modal: generate → sanitise → dispatch
  utils/
    aiHelper.js              # Chrome AI pipelines + sanitiseAIText + extractTextFromBlocks
tests/
  js/                        # Jest / React Testing Library
  php/                       # PHPUnit + Brain/Monkey
```

---

## Running the tests

### Setup (once)

```bash
npm install       # JS dependencies (Jest, RTL, @wordpress/scripts…)
composer install  # PHP dependencies (PHPUnit, Brain/Monkey)
```

---

### JavaScript — Jest + React Testing Library

| Goal | Command |
|---|---|
| All tests | `npm run test:js` |
| Single file | `npm run test:js -- tests/js/aiHelper.test.js` |
| Single test by name | `npm run test:js -- -t "strips HTML tags"` |
| Watch mode (re-runs on save) | `npm run test:js -- --watch` |
| With coverage report | `npm run test:js -- --coverage` |

Test files live in `tests/js/`:

| File | What it covers |
|---|---|
| `aiHelper.test.js` | `sanitizeAIText` (XSS, length, control chars) + `extractTextFromBlocks` |
| `TitlesPanel.test.js` | Trigger button renders, opens modal with `type="title"`, closes |
| `ResumoPanel.test.js` | Trigger button renders, opens modal with `type="excerpt"`, closes |
| `SelectionModal.test.js` | Generate flow, XSS stripping, `editPost` dispatch with correct key |

---

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
| CSRF baseline | `wp_create_nonce` localised to JS via `wp_localize_script` |
| AI output (render) | React renders suggestion strings as text nodes — `dangerouslySetInnerHTML` is absent from the entire codebase |
| AI output (store) | `sanitizeAIText()` strips HTML tags and control characters before `editPost()` is called |
