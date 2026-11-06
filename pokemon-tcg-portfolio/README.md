# Pokémon TCG Portfolio

Houd je Pokémon-collectie (ETB's, UPC's, booster boxes, bundles, tins, losse kaarten) bij met
**actuele Cardmarket-prijzen**. Voeg items toe door er een **foto** van te maken; de app herkent het
product en koppelt het aan de juiste Cardmarket-prijs.

## Functies

- **📸 Toevoegen via foto**: maak een foto met je gsm of kies er een uit je galerij. Er mogen ook meerdere
  producten op één foto staan. Claude (vision) herkent elk product (type, set, kaartnummer, taal),
  waarna de app de beste matches op Cardmarket voorstelt. Kies de juiste, vul aantal en aankoopprijs in, klaar.
- **🔎 Handmatig zoeken** in de volledige Cardmarket-catalogus (afkortingen zoals `etb`, `upc` en `bb` werken).
  Items zonder match kun je toevoegen met een eigen waarde.
- **🗂️ Portfolio**: per item de huidige waarde, de waarde × aantal, het % gestegen/gedaald over 24u, 7d en 30d
  en sinds aankoop, plus een sparkline. Je kunt filteren (sealed/kaarten), zoeken en sorteren.
- **💶 Totaal**: de totale waarde van je portfolio, wat je geïnvesteerd hebt, je winst/verlies (€ en %), het
  waardeverloop over tijd, de verdeling per producttype en de grootste stijgers en dalers.
- **🔴 Live**: de server checkt periodiek op nieuwe Cardmarket-prijzen en pusht wijzigingen via Server-Sent Events
  meteen naar alle open browsers. De waarden bewegen dus mee zonder dat je hoeft te herladen.
- Werkt op mobiel (camera) en desktop.
- **🌙 Dark mode**: met de knop rechtsboven wissel je tussen automatisch (volgt je toestel), donker en licht. Je keuze wordt onthouden.

## Waar komen de prijzen vandaan?

| Product | Bron |
|---|---|
| Sealed (ETB, UPC, booster box, …) en kaarten | De **officiële Cardmarket price guide** (`downloads.s3.cardmarket.com`, Pokémon = game 6): de waarden Trend, Laagste, Gem. 1/7/30 dagen |
| Losse kaarten (exacte set + nummer + afbeelding) | **pokemontcg.io**, die de Cardmarket-prijzen per kaart doorgeeft (incl. reverse holo) |

Standaard telt de **Trend-prijs** als waarde. Dat pas je aan met `PRICE_FIELD` (`trend`, `avg1`, `avg7`,
`avg30`, `low`, `avg`).

> Cardmarket ververst de price guide ongeveer **één keer per dag**. De app checkt standaard elke 30 minuten
> (`PRICE_REFRESH_MINUTES`) of er nieuwe data is en zet die dan meteen live. Daarnaast houdt de app zelf
> een prijsgeschiedenis bij, zodat de grafieken met de tijd voller worden.
>
> De officiële Cardmarket API (OAuth) is niet nodig. Die is bedoeld voor verkopers en staat niet open voor
> nieuwe persoonlijke apps.

## Installatie

Je hebt Node.js 20 of hoger nodig.

```bash
cd pokemon-tcg-portfolio
npm install
cp .env.example .env      # en zet je ANTHROPIC_API_KEY erin voor foto-herkenning
```

### Ontwikkelen

```bash
npm run dev
```

Open daarna http://localhost:5173. Op je gsm gebruik je `http://<ip-van-je-pc>:5173`, binnen hetzelfde wifi-netwerk.

### Productie

```bash
npm run build
npm start                 # serveert app + API op http://localhost:3001
```

### Op je gsm installeren

1. Start de app op je pc met `npm run build && npm start`. In de terminal staat dan
   `Op je gsm (zelfde wifi): http://192.168.x.x:3001`.
2. Open dat adres op je gsm. Je gsm moet op hetzelfde wifi-netwerk zitten.
3. Zet de app op je beginscherm:
   - **iPhone (Safari):** tik op de deelknop ⬆️ en kies **Zet op beginscherm**.
   - **Android (Chrome):** open het menu ⋮ en kies **App installeren** of **Toevoegen aan startscherm**.

Daarna opent de app met een eigen icoon, op volledig scherm. Je pc moet wel aan staan en de server moet draaien.
Wil je de app ook buiten je wifi gebruiken, host hem dan online (bv. Render of Railway, met een persistente schijf voor `data/`).

### Tests

```bash
npm test
```

## Configuratie (`.env`)

| Variabele | Standaard | Uitleg |
|---|---|---|
| `ANTHROPIC_API_KEY` | – | Nodig voor foto-herkenning. Zonder deze sleutel werkt handmatig zoeken nog wel |
| `VISION_MODEL` | `claude-opus-5-5` | Model voor de herkenning |
| `POKEMONTCG_API_KEY` | – | Optioneel, geeft hogere rate limits bij pokemontcg.io |
| `PRICE_REFRESH_MINUTES` | `30` | Hoe vaak de app op nieuwe prijzen checkt |
| `PRICE_FIELD` | `trend` | Welke Cardmarket-prijs als waarde telt |
| `PORT` | `3001` | Poort van de server |
| `DATA_DIR` | `./data` | Map voor je portfolio, foto's en de Cardmarket-cache |

Je data staat in `data/portfolio.json` en de foto's in `data/uploads/`. Maak daar af en toe een backup van.

## Structuur

```
server/
  index.js        Express API + live updates (SSE) + periodieke prijs-refresh
  cardmarket.js   Download/cache van de Cardmarket-catalogus en price guide, en zoeken
  pokemontcg.js   Losse kaarten + Cardmarket-prijzen via pokemontcg.io
  recognize.js    Foto-herkenning met Claude (gestructureerde JSON-output)
  portfolio.js    Waardering, % veranderingen, totalen en geschiedenis
  store.js        JSON-opslag
src/              React-frontend (Portfolio, Totaal, Toevoegen)
```
