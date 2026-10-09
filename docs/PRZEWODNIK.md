# SeniorRouter — przewodnik użytkownika

Claude Code jest szefem projektu: planuje, dzieli pracę, czyta diffy i rozstrzyga. Ciężką produkcję (kod, teksty,
analizy) robią tańsi wykonawcy: Codex (subskrypcja ChatGPT), Antigravity (konto Google) i darmowa pula API
(Groq, Cloudflare, Mistral, OpenRouter, Gemma). Dzięki temu limity Claude'a starczają dużo dłużej, a jakość pilnuje
weryfikacja: nic nie wchodzi do projektu bez sprawdzenia przez Claude'a.

---

## 1. Jak to działa (w 30 sekund)

```
Ty: "zrób X przez router"
  │
  ▼
Claude (orkiestrator, Sonnet)
  1. doprecyzowanie: max 5 pytań, tylko gdy brak informacji zmienia wynik
  2. karta zadania .router/tasks/<id>.json  (cel, pliki, SPRAWDZALNE kryteria, kontekst z grafu)
  3. router route  → poziom T0-T5 + wykonawca (reguły; Haiku tylko przy niejasnych)
  4. router exec   → skaner sekretów → wykonawca pracuje w osobnym git worktree → diff
  5. weryfikacja   → L0 testy/build, L1 każde kryterium z dowodem, L2/L3 recenzja innym modelem, L4 Opus
  6. router next   → pass: merge | fail: poprawka → eskalacja → "best effort" z listą otwartych punktów
```

**Wykonawcy**

| Wykonawca | Co robi | Uruchamia polecenia? |
|---|---|---|
| `free` | darmowe modele przez lokalne proxy LiteLLM; zwracają **patche** (bloki SEARCH/REPLACE) | nie |
| `agy` | Antigravity (Gemini 3.8 Flash / 3.1 Pro) w trybie tylko-odczyt; zwraca **patche** | nie |
| `codex` | agent Codex w worktree, w sandboxie (zapis tylko w worktree) | tak, w sandboxie |
| `claude` | sam Claude: sekrety, projekty poufne, architektura, arbitraż | — |

**Poziomy (domyślny tryb `normal`)**

| Poziom | Typy zadań (pole `type`) | Kto |
|---|---|---|
| T1 | lookup, summarize, triage, format, trivial | free → codex (luna) |
| T2 | implement, test, docs, debug, write, draft | free → codex/agy |
| T3 | feature, refactor, hard-debug, analysis, long-write, worldbuilding, lub `difficulty ≥ 0.7`, lub ≥ 4 pliki, lub słowa ryzyka | codex (gpt-6-astra) → agy (3.1 Pro) → free |
| T4 | architecture, security-review, arbitration, canon-change, sekrety | Claude Opus |
| T5 | tylko tryb `senior` | najmocniejszy Claude |

Kolejność wykonawców: kod `free → codex → agy`, zadania ogólne `free → agy → codex`, kreatywne `agy → free → codex`.
Dostawca z limitem albo niezdrowy jest pomijany automatycznie.

**Eskalacja:** 2 porażki na poziomie → poziom wyżej, a w trybie `normal` zadanie przechodzi na `senior`. Następna
próba omija wykonawcę, który zawiódł. Każda porażka dopisuje do promptu konkretne niespełnione kryteria.

---

## 2. Użycie w nowym projekcie (krok po kroku)

Instalacja globalna (raz na komputer): `powershell -ExecutionPolicy Bypass -File .\setup.ps1` w folderze repo, potem `codex login`,
opcjonalnie Antigravity i klucze z `.env.example` (szczegóły w README). W każdym projekcie:

1. Otwórz folder projektu w Claude Code (aplikacja → nowa sesja w tym katalogu).
2. Napisz: **`/router-init`**. Claude zapyta o:
   - **profil**: `code` (+ stack: python / typescript / csharp / cpp, dowolna kombinacja), `general` (bez kodu:
     analizy, raporty, dokumentacja, research) albo `creative` (gamedev design, worldbuilding, proza);
   - czy projekt jest **poufny** (`confidential`: wtedy nic nie wychodzi poza Claude'a);
   - komendy **testów / lintera / builda** (dla `code`).
3. Init tworzy `.router/` (konfiguracja, karty, logi), `.router/prompts/` (Twoje wytyczne), dopisuje sekcję do
   `CLAUDE.md`, kopiuje reguły ECC dla stacku i buduje graf wiedzy (graphify).
4. Zrób commit. Wykonawcy startują od `HEAD` i nie widzą niezacommitowanych zmian.
5. (Opcjonalnie, ale warto) uzupełnij `.router/prompts/*.md` — patrz rozdział 4.

Sprawdzenie, że wszystko żyje (w dowolnym folderze):

```bash
node "$HOME/.claude/router/router.mjs" doctor --probe
```

---

## 3. Codzienna praca

Piszesz do Claude'a normalnie, dodając „przez router” (albo nic: w projekcie z `.router/` skill włącza się sam).

Przykłady:

- „Przez router: dodaj eksport ekwipunku do JSON z testami.”
- „Przez router: napisz raport porównujący 3 silniki fizyki, max 2 strony, z tabelą.”
- „Przez router, tryb creative: dopisz frakcję Ashen Choir zgodną z kanonem w lore/.”
- „Zmień tryb na eco” / `/mode senior` — patrz tryby niżej.

Claude pokaże Ci decyzję routera (poziom, wykonawca, powód), wynik weryfikacji i poprosi o commit po merge'u.

**Tryby** (`/mode <nazwa>`)

| Tryb | Kiedy | Produkcja | Opus |
|---|---|---|---|
| `eco` | oszczędzanie do maksimum | T1-T2 (T3 tylko trudne) | nigdy |
| `normal` | domyślny | T2-T3 | arbitraż, architektura, ryzyko; słabe wyniki → zadanie przechodzi na senior |
| `senior` | ważne / ryzykowne rzeczy | T3 | planuje i recenzuje, T5 dostępny |
| `creative` | gamedev, worldbuilding, proza | T2-T3, Antigravity pierwszy | tylko zmiany kanonu |

---

## 4. Dostosowanie promptów: kod vs zadania ogólne

Prompt, który dostaje wykonawca, składa się z warstw. Każdą możesz zmienić bez ruszania kodu routera:

| Warstwa | Gdzie | Co zmieniasz |
|---|---|---|
| 1. Twoje polecenie | czat z Claude'em | cel, zakres, priorytety |
| 2. Karta zadania | `.router/tasks/<id>.json` (pisze ją Claude, możesz poprawić) | `goal`, `files`, `acceptance_criteria`, `context`, `kind` |
| 3. Rola i reguły rodzaju | wbudowane: `code` / `general` / `creative` | wybierasz polem `kind` albo profilem projektu |
| 4. Wytyczne projektu | `.router/prompts/common.md` + `.router/prompts/<kind>.md` | konwencje, styl, słownictwo, zakazy |
| 5. Format patcha | wbudowany (dla `free` i `agy`) | nie trzeba ruszać |

**Podgląd dokładnego promptu** przed uruchomieniem:

```bash
node "$HOME/.claude/router/router.mjs" prompt <id>
```

### 4.1 Rodzaje zadań (`kind`)

| `kind` | Rola wykonawcy | Wbudowane reguły | Ustawiany automatycznie gdy |
|---|---|---|---|
| `code` | senior software engineer | konwencje kodu, testy najpierw (RED → GREEN) | profil `code` i typy implement/feature/refactor/debug/test |
| `general` | senior analyst and technical writer | precyzja, struktura (nagłówki, listy, tabele), jawne założenia, zero zmyślania | profil `general` lub typy docs/summarize/analysis/lookup/triage |
| `creative` | senior narrative designer and writer | styl i kanon projektu, konkret zamiast ogólników | profil `creative` lub typy write/draft/long-write/worldbuilding/canon-change |

Wymuszenie w karcie: `"kind": "general"` (np. analiza w projekcie z kodem).

### 4.2 Pliki `.router/prompts/`

- `common.md` — dołączany do **każdego** promptu wykonawcy w tym projekcie.
- `code.md`, `general.md`, `creative.md` — dołączany tylko do zadań danego rodzaju.
- Komentarze `<!-- ... -->` są pomijane. Pisz krótko, po angielsku (modele lepiej trzymają się takich reguł),
  maksymalnie kilkanaście linijek — to idzie do każdego wywołania.

**Przykład: projekt z kodem (Unity / C#)**

`.router/prompts/code.md`
```markdown
- C# 10, Unity 2023 LTS. Follow .editorconfig; PascalCase for public members, _camelCase for private fields.
- No LINQ in Update()/FixedUpdate() hot paths; no allocations per frame.
- Tests: NUnit in Assets/Tests/EditMode; every new public method gets a test.
- Never touch ProjectSettings/ or *.meta files.
```

**Przykład: projekt ogólny (raporty, analizy)**

`.router/prompts/general.md`
```markdown
- Write in Polish, plain language, short paragraphs.
- Start every document with a 3-line summary (what, why, recommendation).
- Every number needs a source in the form [source: file or URL]. If unknown, write "brak danych".
- Use tables for comparisons; no more than 2 heading levels.
```

**Przykład: projekt kreatywny (worldbuilding)**

`.router/prompts/creative.md`
```markdown
- Canon lives in lore/*.md; never contradict it. If something is undefined, mark it as [PROPOSAL].
- Tone: bleak, restrained, concrete. No modern idioms, no humor.
- Names: Slavic-sounding, max 3 syllables.
```

### 4.3 Kryteria akceptacji: najważniejsza dźwignia jakości

Router i weryfikacja są tak dobre, jak kryteria. Muszą być **sprawdzalne**.

| Kod (dobre) | Ogólne / kreatywne (dobre) | Złe (niesprawdzalne) |
|---|---|---|
| ``python -m unittest -q` exits 0`` | „dokument ma sekcje: Podsumowanie, Porównanie, Rekomendacja” | „kod jest czysty” |
| „`count()` zwraca 0 dla nieznanego przedmiotu (pokryte testem)” | „tabela porównuje dokładnie 3 silniki w 4 kolumnach” | „raport jest dobry” |
| „zmienione tylko `src/a.py` i `tests/test_a.py`” | „250-400 słów” / „żadna liczba bez źródła” | „ładny styl” |
| „`dotnet build` bez ostrzeżeń” | „nie przeczy lore/world.md (bogowie nie odpowiadają)” | „zgodne z wizją” |

### 4.4 Gotowe polecenia do wklejenia

**Zadanie z kodem**
```text
Przez router: <co zrobić>.
Pliki: <ścieżki albo "ustal z grafu">.
Kryteria: testy przechodzą (<komenda>), <zachowanie 1>, <zachowanie 2>, zmienione tylko wymienione pliki.
Trudność: <niska/średnia/wysoka>. Ryzyko: <np. dotyka zapisu gry>.
```

**Zadanie ogólne (analiza, raport, dokumentacja)**
```text
Przez router, kind=general: <co przygotować> w <plik.md>.
Odbiorca: <kto>. Długość: <ile>. Format: <sekcje / tabela>.
Kryteria: <sekcje>, <każda liczba ze źródłem>, <rekomendacja w 1 akapicie>, nic poza tym plikiem.
Źródła: <pliki / linki, z których wolno korzystać>.
```

**Zadanie kreatywne**
```text
Przez router, tryb creative: <co napisać> w <plik>.
Kanon: <pliki>. Ton: <...>. Długość: <...>.
Kryteria: zgodność z kanonem (<kluczowe fakty>), <elementy obowiązkowe>, istniejące sekcje bez zmian.
```

---

## 5. Konfiguracja projektu (`.router/config.json`)

| Pole | Znaczenie |
|---|---|
| `profile` | `code` / `general` / `creative` |
| `stacks` | języki dla reguł ECC i reviewera |
| `confidential` | `true` = żadnych zewnętrznych wykonawców ani sędziów |
| `mode` | tryb domyślny projektu |
| `auto_escalate_mode` | dokąd przechodzi zadanie po słabych wynikach (`senior`) |
| `verify.test/lint/build` | komendy weryfikacji L0 |
| `risk_keywords` | słowa podnoszące ryzyko (T3 + recenzja Opusem) |
| `disabled_providers` | np. `["free"]`, żeby w tym projekcie nie używać darmowej puli |

Globalnie (`~/.claude/router/`): `providers.json` (modele na poziomach, pula darmowa, kolejność),
`modes/*.json` (parametry trybów), `health.json` (stan dostawców), `litellm.config.yaml` (generowany).
Zmiany robisz w sklonowanym repo, potem `node router/router.mjs install`.

---

## 6. Bezpieczeństwo

- Sekrety (`.env`, klucze, hasła, dane osobowe): karta `touches_secrets: true` → robi to tylko Claude.
- Przed każdym wysłaniem na zewnątrz działa gitleaks (worktree + prompt + diff). Trafienie = blokada.
- Darmowe API mogą trenować na danych → projekty wrażliwe oznacz `confidential: true`.
- Zewnętrzne modele (`free`, `agy`) nic nie uruchamiają; Codex działa w sandboxie (zapis tylko w worktree).
- Wykonawcy nie dostają Twoich konektorów, MCP ani kont.

---

## 7. Ściąga komend

`R` = `node "$HOME/.claude/router/router.mjs"` (uruchamiaj w katalogu projektu).

| Komenda | Po co |
|---|---|
| `R doctor --probe` | stan narzędzi i wykonawców (prawdziwy test Codexa i Antigravity) |
| `R free status` / `R free check [--reset]` | stan darmowej puli / test każdego modelu (psujące się są wyłączane) |
| `R mode [eco\|normal\|senior\|creative]` | tryb projektu |
| `R route <id>` / `R exec <id>` / `R prompt <id>` | decyzja / wykonanie / podgląd promptu |
| `R next <id> --verdict pass\|fail --notes "a; b"` | werdykt i decyzja co dalej |
| `R accept <id>` / `R reject <id>` | merge (staged, bez commita) / odrzucenie |
| `R usage` / `R stats` | zużycie per dostawca / skuteczność per typ-poziom-wykonawca + propozycje zmian reguł |

---

## 8. Problemy

| Objaw | Co zrobić |
|---|---|
| Codex: `setup refresh had errors` | router sam przełącza się na sandbox `unelevated` na 24 h; trwała naprawa: aplikacja Codex desktop (admin) |
| Darmowy model padł / zwraca bzdury | `R free check` (wyłącza zepsute), `R free check --reset` (testuje ponownie) |
| 429 / limit | router pomija dostawcę (1-6 h) i bierze następnego |
| Mistral: tylko codestral działa | aktywuj plan Experiment w konsoli Mistral |
| Gemini CLI: 20 zapytań/dzień | nieużywane; Gemini idzie przez Antigravity (`agy`) |
| Zadanie krąży | `R next` eskaluje po 2 porażkach albo przy identycznym diffie; budżet 6 prób → best effort |

## 9. Wycofanie

```bash
node <folder-repo>/router/router.mjs uninstall
```
W projekcie usuń `.router/`, `.claude/rules/ecc/` i sekcję `<!-- router -->` z `CLAUDE.md`.
