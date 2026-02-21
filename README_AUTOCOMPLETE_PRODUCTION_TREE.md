# Guide: Multilingual `production.name` Autocomplete + Depth-Limited Production Tree

This guide describes how to implement two features on top of the current LCIA microservice:

1. Autocomplete for available `production.name` options using vector search (works with any human language input if your embedding model is multilingual).
2. Production tree retrieval to a requested depth, filtered to requested `biosphere_flows.name` values.

The guide is implementation-oriented and aligned with existing endpoints in this repository.

---

## 1) Current API Building Blocks (already available)

- `GET /api/v1/services/{service_name}/activities`
  - Lists calculable activities/products (`uuid`, `name`, `product`, `location`, `unit`, `database`), with `search`, `offset`, `limit`.
- `GET /api/v1/search-process`
  - Semantic process search (vector-based when embeddings are loaded), with optional service and location filters.
- `GET /api/v1/production-recipe/{service_name}/{uuid}`
  - Returns one node recipe:
    - `activity`
    - `production`
    - `technosphere_inputs`
    - `biosphere_flows`

These are enough to implement both features without changing matrix calculation logic.

---

## 2) Feature A — Autocomplete of available `production.name` options

## Goal

When user types free text in any language (e.g., English, Hungarian, Spanish, Arabic), return best matching producible options for selection.

## Recommended architecture

Use a dedicated indexed list of production options per service:

- `uuid`: activity/product UUID used for downstream calls
- `production_name`: display label from recipe production block
- `activity_name`: fallback/readable context
- `location`, `database`, `unit`
- `embedding_vector`: vector of `production_name` (optionally plus aliases)

### 2.1 Build production option index (offline or startup task)

1. Get all calculable entries:
   - `GET /api/v1/services/{service}/activities?limit=10000&offset=0`
   - paginate until all are collected.
2. For each `uuid`, fetch recipe:
   - `GET /api/v1/production-recipe/{service}/{uuid}`
3. Extract:
   - `production_name = recipe.production.product` (fallback to `recipe.activity.product` then `recipe.activity.name`)
4. Store unique options by `(service, uuid)` (or `(service, production_name, location)` depending on UI behavior).
5. Create and store embeddings for `production_name` using your multilingual embedding model.

### 2.2 Add autocomplete endpoint

Add endpoint:

- `GET /api/v1/services/{service}/production-options/autocomplete`
  - Query params:
    - `q` (user input)
    - `limit` (default 10, max 50)
    - `location` (optional)
  - Behavior:
    1. vector-search in production option index with `q`
    2. optional location filter
    3. return ranked candidates with similarity

Example response:

```json
{
  "service": "agribalyse",
  "query": "görög joghurt",
  "count": 5,
  "results": [
    {
      "uuid": "32b402702f3468f1243cc2f69ca5f41d",
      "production_name": "Greek-style yogurt",
      "activity_name": "Yogurt, Greek style production",
      "location": "FR",
      "unit": "kg",
      "similarity": 0.92
    }
  ]
}
```

### 2.3 Frontend autocomplete flow

1. Debounce input (200–300 ms).
2. Request `.../production-options/autocomplete?q=<text>&limit=10`.
3. Show top matches in dropdown (display `production_name`, secondary line: `location`, `activity_name`).
4. On select, keep `uuid` as canonical value.
5. Use selected `uuid` for tree and LCIA requests.

## Notes on multilingual behavior

- “Any human language” quality depends on embedding model multilingual support.
- If needed, improve recall with alias expansion:
  - singular/plural
  - spelling variants
  - domain synonyms
  - transliterated forms

---

## 3) Feature B — Production tree to depth with biosphere-name filtering

## Goal

Return a recursive tree of technosphere dependencies from a selected root UUID, up to depth `N`, while only returning biosphere flows whose names match requested filters.

## Endpoint design

Add endpoint:

- `POST /api/v1/production-tree/{service_name}/{uuid}`

Request body example:

```json
{
  "max_depth": 3,
  "biosphere_flow_names": ["Carbon dioxide, fossil", "Methane", "Water"],
  "name_match_mode": "contains",
  "case_sensitive": false,
  "max_children_per_node": 50,
  "min_abs_amount": 0.0
}
```

## Core recursion algorithm

1. Fetch root recipe via `get_production_recipe(service, uuid)`.
2. Filter `biosphere_flows` by requested names.
3. If `current_depth < max_depth`, iterate `technosphere_inputs`:
   - optionally skip tiny amounts (`abs(amount) < min_abs_amount`)
   - if `input.database == service`, recurse into child UUID
   - otherwise include as external leaf
4. Stop recursion on:
   - depth limit reached
   - cycle detected
   - child cap reached

### Cycle protection (required)

Use a path-local set:

- Pass `visited_path: Set[str]` into recursion.
- Before recursing into child UUID:
  - if already in `visited_path`, return child node with `"cycle": true` and do not recurse further.

### Matching strategy for `biosphere_flows.name`

Normalize names:

- lowercase (unless case-sensitive requested)
- optional unicode normalization (`NFKC`)

Support at least:

- `exact`: normalized equality
- `contains`: any token/name substring match

---

## 4) Reference response shape for tree endpoint

```json
{
  "service": "agribalyse",
  "root_uuid": "32b402702f3468f1243cc2f69ca5f41d",
  "max_depth": 3,
  "biosphere_filter": {
    "names": ["Carbon dioxide, fossil", "Methane", "Water"],
    "mode": "contains"
  },
  "tree": {
    "activity": {"uuid": "...", "name": "...", "product": "...", "unit": "kg", "location": "FR"},
    "production": {"product": "...", "amount": 1.0, "unit": "kg"},
    "biosphere_flows": [
      {"uuid": "...", "name": "Carbon dioxide, fossil", "amount": 0.42, "unit": "kg"}
    ],
    "technosphere_inputs": [
      {
        "uuid": "child-uuid-1",
        "name": "Milk production",
        "amount": 1.2,
        "unit": "kg",
        "database": "agribalyse",
        "child": {
          "activity": {"uuid": "child-uuid-1", "name": "..."},
          "production": {"product": "...", "amount": 1.0, "unit": "kg"},
          "biosphere_flows": [],
          "technosphere_inputs": []
        }
      }
    ]
  }
}
```

---

## 5) Minimal backend implementation plan

1. Add request model in `main.py` for tree options (`max_depth`, `biosphere_flow_names`, matching mode).
2. Add helper in `direct_lcia.py`:
   - `build_production_tree(db_name, uuid, max_depth, biosphere_flow_names, ...)`
   - internally reuses existing `get_production_recipe`.
3. Add new endpoint in `main.py` calling this helper.
4. Add in-memory cache for recipe fetches per request (`dict[(service, uuid)] = recipe`) to avoid repeated SQLite reads.
5. Add limit guards:
   - max depth upper bound (e.g., 6)
   - max children per node
   - optional max total nodes

---

## 6) Performance and reliability recommendations

- Use request-scoped memoization for recipes and filtered biosphere lists.
- Sort children by `abs(amount)` descending, then truncate to `max_children_per_node`.
- Return partial tree with warnings when limits are hit.
- Include diagnostics in response:
  - `nodes_visited`
  - `cycles_detected`
  - `truncated_children_count`

---

## 7) End-to-end usage sequence

1. User types text in any language.
2. UI calls autocomplete endpoint and receives ranked `production_name` options.
3. User selects one option (`uuid`).
4. UI calls tree endpoint with `max_depth` and requested biosphere names.
5. UI renders tree and shows only matching biosphere flows at each node.

---

## 8) Backward compatibility

This design is additive and does not break existing clients:

- Keep current endpoints unchanged.
- Add new endpoints for autocomplete and tree.
- Existing `/api/v1/production-recipe/{service}/{uuid}` remains the single-node primitive.
