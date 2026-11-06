// Foto-herkenning: Claude bekijkt de foto en geeft per zichtbaar product
// (ETB, UPC, booster box, losse kaart, ...) de gestructureerde gegevens terug.
// Daarna zoeken we die op in Cardmarket / pokemontcg.io.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.VISION_MODEL || 'claude-opus-5-5';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'product_type', 'name', 'set_name', 'card_number', 'language', 'quantity', 'search_query', 'confidence'],
        properties: {
          kind: { type: 'string', enum: ['single', 'sealed'] },
          product_type: {
            type: 'string',
            enum: ['Single', 'ETB', 'UPC', 'Booster Box', 'Booster Bundle', 'Booster Pack', 'Tin', 'Collection Box', 'Blister', 'Sealed'],
          },
          name: { type: 'string', description: 'Kaartnaam (bv. "Charizard ex") of volledige productnaam in het Engels.' },
          set_name: { type: 'string', description: 'Engelse setnaam (bv. "151", "Evolving Skies"), leeg als onbekend.' },
          card_number: { type: 'string', description: 'Kaartnummer zoals "199/165", leeg voor sealed of onbekend.' },
          language: { type: 'string', description: 'Taal van het product, bv. English, Japanese, German.' },
          quantity: { type: 'integer', description: 'Hoeveel identieke exemplaren op de foto staan.' },
          search_query: {
            type: 'string',
            description: 'Engelse zoekterm zoals Cardmarket het product noemt, bv. "Scarlet & Violet 151 Elite Trainer Box" of "Charizard ex".',
          },
          confidence: { type: 'number', description: '0..1' },
        },
      },
    },
  },
};

const SYSTEM = `Je herkent Pokémon TCG producten op foto's voor een portfolio-app die prijzen van Cardmarket gebruikt.
Geef elk afzonderlijk product op de foto terug (identieke exemplaren samenvoegen via quantity).
- Sealed: Elite Trainer Box (ETB), Ultra Premium Collection (UPC), booster box/display, booster bundle, booster pack, tin, collection box, blister.
  Gebruik de officiële Engelse productnaam inclusief set, zoals Cardmarket die noemt.
- Losse kaarten: lees naam, setnaam (via set-symbool/code als dat zichtbaar is) en kaartnummer linksonder/rechtsonder zo exact mogelijk.
Gok geen details die je niet kunt zien: laat set_name of card_number leeg als je het niet zeker weet en verlaag confidence.
Staat er geen Pokémon TCG product op de foto, geef dan een lege items-lijst.`;

let client = null;
export const recognitionEnabled = () =>
  Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export async function recognizePhoto(buffer, mediaType) {
  if (!recognitionEnabled()) {
    throw Object.assign(new Error('Geen ANTHROPIC_API_KEY ingesteld — foto-herkenning staat uit. Gebruik handmatig zoeken.'), { status: 503 });
  }
  client ||= new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } },
          { type: 'text', text: 'Welke Pokémon TCG producten staan op deze foto?' },
        ],
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw Object.assign(new Error('De foto kon niet geanalyseerd worden.'), { status: 422 });
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return JSON.parse(text).items ?? [];
  } catch {
    throw Object.assign(new Error('Onverwacht antwoord van de herkenning, probeer opnieuw.'), { status: 502 });
  }
}
