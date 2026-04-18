## Application Details
|               |
| ------------- |
|**Generation Date and Time**<br>Sat Feb 14 2026 04:24:03 GMT+0700 (Indochina Time)|
|**App Generator**<br>SAP Fiori Application Generator|
|**App Generator Version**<br>1.20.1|
|**Generation Platform**<br>Visual Studio Code|
|**Template Used**<br>Basic V2|
|**Service Type**<br>File|
|**Metadata File**<br>metadata.xml|
|**Module Name**<br>buildtrack|
|**Application Title**<br>BuildTrack System|
|**Namespace**<br>z.bts|
|**UI5 Theme**<br>sap_horizon|
|**UI5 Version**<br>1.144.1|
|**Enable TypeScript**<br>False|
|**Add Eslint configuration**<br>False|

## buildtrack

An SAP Fiori application.

### Starting the generated app

-   This app has been generated using the SAP Fiori tools - App Generator, as part of the SAP Fiori tools suite.  To launch the generated application, run the following from the generated application root folder:

```
    npm start
```

- It is also possible to run the application using mock data that reflects the OData Service URL supplied during application generation.  In order to run the application with Mock Data, run the following from the generated app root folder:

```
    npm run start-mock
```

#### Pre-requisites:

1. Active NodeJS LTS (Long Term Support) version and associated supported NPM version.  (See https://nodejs.org)

## BuildTrack RAG Assistant (Gemini)

This project now includes a production-style RAG chatbot to guide users through BuildTrack usage.

### Architecture

- SAPUI5 frontend dialog integrated in App header.
- Python RAG service in `rag-server-py/`.
- Knowledge indexing from BuildTrack docs + selected source files.
- Retrieval by cosine similarity over Gemini embeddings.
- Answer generation with Gemini chat model and citations.

### Setup

1. Install dependencies:

```
npm install
```

2. Create environment file from template:

```
copy rag-server-py/.env.example .env
```

3. Open `.env` and set:

```
GEMINI_API_KEY=<your_key>
RAG_PORT=4001
RAG_CHAT_MODEL=gemini-2.0-flash
RAG_EMBED_MODEL=gemini-embedding-001
RAG_ENABLE_EMBEDDINGS=false
```

`RAG_ENABLE_EMBEDDINGS=false` is recommended for fast startup and free-tier stability.
Set it to `true` only if your quota is sufficient.

### Run

- Local mode with real backend proxy:

```
npm run dev:local
```

- Mock mode with mock OData:

```
npm run dev:mock
```

`dev:local` and `dev:mock` do not run Python.
Python 3.13+ is only required when you explicitly run `npm run rag:start` or `npm run rag:index`.

### Rebuild Knowledge Index

```
npm run rag:index
```

Or from UI dialog: press **"Cap nhat tri thuc"**.


