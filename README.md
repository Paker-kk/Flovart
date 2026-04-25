Flovart

Last updated: 2026-04-25

Flovart is a local-first AI creative workspace for building visual ideas on an infinite canvas and turning repeatable creative steps into node-based workflows.

The product direction is intentionally focused:

1. Canvas
Tapnow-style infinite canvas for visual creation, generation results, references, layers, annotations, and reusable design material.

2. Workflow
Node-based AI creation pipeline for prompts, model calls, image/video generation, previews, pinned outputs, trace details, and write-back to canvas.

Flovart uses a bring-your-own-key model. You choose and configure the AI providers, API keys, and endpoints you want to use. Flovart does not provide hosted AI inference, model credits, payment accounts, or provider guarantees by default.


Quick start

npm install
npm run dev

Open:

http://127.0.0.1:3217/

Common commands:

npm test
npm run build
npm run ext:build


Important risk notice

Flovart can help you create images, videos, prompts, workflows, and design assets, but you are responsible for how you use it.

When you call a third-party AI provider or custom endpoint, your prompts, uploaded files, references, generated outputs, request metadata, and API key may be sent to that provider. Those services are governed by their own terms, privacy policies, billing rules, safety policies, and data practices.

Do not upload secrets, private personal data, confidential client material, regulated data, third-party copyrighted content, or images of people unless you have the right and permission to do so.

AI output may be inaccurate, incomplete, biased, unsafe, infringing, or unsuitable for your intended use. Review all outputs before publishing, selling, relying on, or distributing them.

Do not use AI output for legal, medical, financial, safety-critical, employment, credit, housing, insurance, education, or other high-impact decisions without qualified human review.

Local-first does not mean risk-free. Browser storage, extension storage, desktop app storage, local files, cloud backups, browser sync, malware, shared computers, untrusted extensions, and custom endpoints can expose your data or keys.


License

Flovart is licensed under AGPL-3.0-only.

AGPL-3.0 is a strong copyleft license. If you copy, modify, distribute, host, or provide network access to Flovart or a modified version, you may have source-code disclosure, notice, and license-preservation obligations.

See the LICENSE file for the official GNU Affero General Public License Version 3 text.

This README is only a summary and is not legal advice. If you plan to publish, host, resell, distribute, commercially operate, or integrate a modified version, you should obtain qualified legal review.


Terms and privacy

Terms of Service:
TERMS_OF_SERVICE.md

Privacy Policy:
PRIVACY_POLICY.md


Project status

The formal planning docs currently go through P8.

P1: App shell and workspace navigation.
P2: Workflow productization.
P3: Storyboard and VideoEdit MVP.
P4: Motion and interaction polish.
P5: Provider and model template system.
P6: Execution trace and observability.
P7: Agent, skill, and browser bridge integration.
P8: Collaboration and publishing pipeline.

There is no standalone formal P9 document at this time.
