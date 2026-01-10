We can call V0 just about feature complete. Well done team! There are a few minor features and improvements that we can consider for V1. Here are the instructions for next version:

1. We need to restyle the app. A new logo can be found in the public folder. We need a colour scheme. We need modern and usable, but can have some colours too. Make me a few suggestions and implement a theme picker to allow users to select between them. We can decide on hardcoding one later. Think modern, professional but friendly.

2. User should be allowed to drop a file into the upload area instead of selecting it via a file dialog.

3. Add a spinner or loading indicator when the app is processing a file. This should be visible until the results are ready.

4. When a user uploads the file the analysis should start automatically. No need for a separate button to start the analysis. Move straight to the analysis view.

5. On analysis view we need to make changes:

   - Show all results, not just top 25
   - Objekttyper can be presented as the first of the fields. No need for a separate section.
   - The buttons to change tabs "punkter" and "ledninger" should be more prominent and more obviously tabs, not just buttons. They can move from the right to the left of the section. The "utforsk data" title can move up and be made larger. Decide a style of text here than can be consistent across the app.
   - Each field should start minimiased but should be sxpandable to display a pivot table of all values for that field.
   - I am unsure if the app is currently checking the fields.json data for field names. I want the raw codes to be the default display, but if a field name is found in fields.json it should be displayed alongside the code in brackets. E.g. "12345 (Building Height)". If no field name is found, just display the code.

6. On the "Filtrer" view the same changes to the tab buttons should be made. There are some fields that are currently greyout out, for example "EGS_PUNKT", "EGS_LEDNING". Please look into why these are greyout out and give me an explanation.
7. On the "Filtrer" view there is an explanation of (keep) This should be in Norwegian. Infact remove it and write a short sentance in Norwegian at the top of the view explaining how to use the filters.
8. On the "Filtrer" section the buttons for "Tilbake til standard" "Eksportere utvalg (JSON)" etc need looking at. It is not clear what they do, and they appear in a line with the most important button "Gå til nedlasting". The buttons need moving, maybe to a dropdown menu, and a better explanation of what they do is needed.

9. A general overhaul of the UI could be good. We are not utilising the size of the screen. This app i designed for desktop use. Lets generally increase the size of the tables and lists to better us ehte space we have.

---

## Questions / avklaringer før vi koder (V1)

Jeg har lest både denne filen og [COPILOT_INSTRUCTIONS.md](COPILOT_INSTRUCTIONS.md). Under er spørsmål/valg som vil påvirke implementasjonen.

### Versjon / branch

1. Jeg har laget branch `v1/2026-01-ui-upload-flow` og bumpet versjon fra `0.1.0` → `0.2.0` i `package.json`/`package-lock.json`. Er `0.2.0` OK som “V1 work-in-progress”, eller ønsker du en annen semver (f.eks. `0.1.1` eller `1.0.0`)?

### Tema + restyling

2. Tema-velger: Skal valgt tema lagres i localStorage (anbefalt) og gjelde hele appen, eller bare gjelde for inneværende sesjon?
3. Logo: Hvilken fil i `public/` er “ny logo” vi skal bruke (filnavn), og hvor ønsker du den plassert (øverst til venstre ved siden av tittel, eller sentrert i header)?
4. Forslag til 3 enkle tema (kan endres senere):
   - **Nøytral**: dagens “zinc/gray” (professionell)
   - **Hav**: blå/indigo aksent (trygg/teknisk)
   - **Skog**: grønn/teal aksent (vennlig)
     Vil du at vi kun bytter aksentfarge + bakgrunn/kontrast, eller også tabellheader/knapper tydelig mer “tema”? (Jeg foreslår aksent + overflatefarger for å holde det ryddig.)

### Opplasting + automatisk analyse

5. Instruksjon #4 sier analyse skal starte automatisk ved upload. Skal det trigges:
   - når bruker velger fil i fil-dialog (onChange), og/eller
   - når bruker dropper fil i dropzone?
     (Jeg antar “begge”.)
6. Når analyse starter automatisk: Skal vi beholde “steg-knappene” (1-4) som navigasjon, eller skal vi skjule/disable de under behandling for å unngå at folk hopper rundt mens den jobber?

### Lasting / spinner

7. Ønsker du en liten spinner i knappen (minimal), eller en tydelig overlay/”loading panel” i midten av skjermen som viser “Analyserer…” / “Genererer…” og blokkerer interaksjon?

### Utforsk data (analysevisning)

8. “Show all results”:
   - Bekrefter du at det er OK at listene blir scrollbare (ikke paginering)?
   - Skal sorteringen fortsatt være “mest først”, deretter alfabetisk?
9. “Objekttyper som første felt”: Ønsker du at vi viser `OBJTYPE` som en vanlig field-seksjon (med count/fordeling), og fjerner den separate “Objekttyper”-boksen helt?
10. “Felt minimisert + expandable pivot table”: Hva mener du med pivot her?

- A) En enkel frekvenstabell: **verdi → antall** for feltet (typisk), eller
- B) En krysstabell: **OBJTYPE × feltverdi** (kan bli tung), eller
- C) Noe annet?
  NB: Dagens analyse teller bare felt-nøkler (ikke verdier). For pivot per felt må vi telle verdier også (helst lazy når feltet åpnes).

### Feltnavn fra `fields.json`

11. Status i V0: Appen bruker ikke `src/data/fields.json` i UI i dag (ingen mapping). I tillegg ser `fields.json` ut til å ha domene-felter (GMI/innmålingsinstruks) som ikke matcher SOSI-nøklene vi ser (f.eks. `OBJTYPE`, `...P_TEMA`).

- Har du en separat mapping fra SOSI-feltkode → “friendly name”, eller ønsker du at vi bygger en ny liten fil (f.eks. `src/data/field-names.json`) etter hvert?
- Når du skriver eksempel `"12345 (Building Height)"`: Forekommer det faktisk numeriske feltkoder i dine SOSI-filer, eller var det bare et eksempel?

### Filtrer (forklaring + grå felter + knapper)

12. “Grå felter” (f.eks. `EGS_PUNKT`, `EGS_LEDNING`): I V0 er disse låst som **obligatoriske** felter (kan ikke fjernes) og vises derfor disabled/grå. Jeg antar dette er bevisst for at renset SOSI fortsatt skal ha nødvendig struktur. Skal de fortsatt være låst i V1?
13. Tekst “(keep)”: I V0 står det “Objekttyper (keep)” og “Felter (keep)”. Du ønsker dette fjernet og erstattet med en kort norsk setning øverst.

- Forslag: “Velg hvilke objekttyper og felter som skal være med i eksporten.”
  Er det OK, eller har du foretrukket formulering?

14. Knapper i filtrering (“Tilbakestill…”, eksport/import JSON, slett innstillinger): Ønsker du at disse flyttes til en “Avanserte valg”-dropdown/meny, og at vi legger inn korte forklaringer under hver handling (tooltip/tekstlinje)?

- Hvilke handlinger skal være synlige som primærknapper ved siden av “Gå til nedlasting”, og hvilke skal gjemmes i meny?

### Skjermbruk / desktop

15. “Utnytte skjermen”: Ønsker du full-bredde layout (f.eks. droppe `max-w-6xl`), eller fortsatt en maks-bredde men med større tabeller/typografi?
