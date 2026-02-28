/**
 * getActiveLinkMap – returns the link map to use at runtime.
 *
 * Reads `window.aiPostAssistantData.settings.linkMap` (saved via the admin
 * settings page). If the option is empty or contains invalid JSON the
 * hardcoded LINK_MAP below is used as a safe fallback.
 *
 * @returns { Array<{url: string, keywords: string[]}> }
 */
export function getActiveLinkMap() {
	const raw = window.aiPostAssistantData?.settings?.linkMap ?? '';

	if ( raw.trim() ) {
		try {
			const parsed = JSON.parse( raw );
			if ( Array.isArray( parsed ) && parsed.length > 0 ) {
				return parsed;
			}
		} catch {
			// Invalid JSON – fall back to the default list below.
		}
	}

	return LINK_MAP;
}

// =============================================================================

/**
 * LINK_MAP – keyword-to-URL mapping for the "IA Links" feature.
 *
 * Each entry defines:
 *   url      – the full target URL (must be absolute).
 *   keywords – ordered list of phrases to search for in the post text.
 *              Listed from most-specific to least-specific so that
 *              "Santos FC" is tried before "Santos", preventing the shorter
 *              term from consuming both link slots when the longer one exists.
 *
 * At most 2 links are inserted per URL across the entire post (counting
 * existing links already present in the editor).
 */
export const LINK_MAP = [

	// ── Campeonatos nacionais ─────────────────────────────────────────────────
	{
		url:      'https://lance.com.br/tudo-sobre/campeonato-brasileiro',
		keywords: [ 'Campeonato Brasileiro', 'Brasileirão' ],
	},
	{
		url:      'https://lance.com.br/tudo-sobre/copa-do-brasil',
		keywords: [ 'Copa do Brasil' ],
	},
	{
		url:      'https://lance.com.br/tudo-sobre/campeonato-paulista',
		keywords: [ 'Campeonato Paulista', 'Paulistão' ],
	},
	{
		url:      'https://lance.com.br/tudo-sobre/campeonato-carioca',
		keywords: [ 'Campeonato Carioca', 'Cariocão' ],
	},
	{
		url:      'https://lance.com.br/tudo-sobre/campeonato-mineiro',
		keywords: [ 'Campeonato Mineiro' ],
	},
	{
		url:      'https://lance.com.br/tudo-sobre/campeonato-gaucho',
		keywords: [ 'Campeonato Gaúcho', 'Gauchão' ],
	},
	{
		url:      'https://lance.com.br/tudo-sobre/brasileirao-serie-b',
		keywords: [ 'Brasileirão Série B', 'Série B' ],
	},
	{
		url:      'https://lance.com.br/tudo-sobre/copa-do-nordeste',
		keywords: [ 'Copa do Nordeste', 'Nordestão' ],
	},
	{
		url:      'https://lance.com.br/tudo-sobre/brasileirao-feminino',
		keywords: [ 'Brasileirão Feminino' ],
	},

	// ── Outros esportes ───────────────────────────────────────────────────────
	{
		url:      'https://lance.com.br/tudo-sobre/nbb',
		keywords: [ 'Novo Basquete Brasil', 'NBB' ],
	},
	{
		url:      'https://lance.com.br/tudo-sobre/superliga-de-volei',
		keywords: [ 'Superliga de Vôlei', 'Superliga de Volei' ],
	},
	{
		url:      'https://lance.com.br/tudo-sobre/stock-car',
		keywords: [ 'Stock Car' ],
	},
	{
		url:      'https://lance.com.br/tudo-sobre/liga-nacional-de-futsal',
		keywords: [ 'Liga Nacional de Futsal', 'LNF' ],
	},
	{
		url:      'https://lance.com.br/tudo-sobre/bsop',
		keywords: [ 'Brazil Series of Poker', 'BSOP' ],
	},
	{
		url:      'https://lance.com.br/tudo-sobre/volei-de-praia',
		keywords: [ 'Vôlei de Praia', 'Volei de Praia' ],
	},

	// ── Competições internacionais ────────────────────────────────────────────
	{
		url:      'https://lance.com.br/tudo-sobre/copa-libertadores',
		keywords: [ 'Copa Libertadores', 'Libertadores' ],
	},
	{
		url:      'https://lance.com.br/tudo-sobre/uefa-champions-league',
		keywords: [ 'UEFA Champions League', 'Champions League', 'Liga dos Campeões' ],
	},
	{
		url:      'https://lance.com.br/tudo-sobre/mundial-de-clubes',
		keywords: [ 'Mundial de Clubes', 'Club World Cup' ],
	},
	{
		url:      'https://lance.com.br/tudo-sobre/liga-europa',
		keywords: [ 'Liga Europa', 'Europa League' ],
	},
	{
		url:      'https://lance.com.br/tudo-sobre/ufc',
		keywords: [ 'UFC' ],
	},
	{
		url:      'https://lance.com.br/tudo-sobre/nfl',
		keywords: [ 'NFL' ],
	},
	{
		url:      'https://lance.com.br/tudo-sobre/nba',
		keywords: [ 'NBA' ],
	},

	// ── Clubes ────────────────────────────────────────────────────────────────
	{
		url:      'https://lance.com.br/flamengo',
		keywords: [ 'Flamengo' ],
	},
	{
		url:      'https://lance.com.br/corinthians',
		keywords: [ 'Corinthians' ],
	},
	{
		url:      'https://lance.com.br/palmeiras',
		keywords: [ 'Palmeiras' ],
	},
	{
		// More-specific form first to avoid linking "São Paulo" when the text
		// says "São Paulo FC" and both quota slots should go to the club.
		url:      'https://lance.com.br/sao-paulo',
		keywords: [ 'São Paulo FC', 'São Paulo' ],
	},
	{
		url:      'https://lance.com.br/vasco',
		keywords: [ 'Vasco da Gama', 'Vasco' ],
	},
	{
		url:      'https://lance.com.br/santos',
		keywords: [ 'Santos FC', 'Santos' ],
	},
	{
		url:      'https://lance.com.br/gremio',
		keywords: [ 'Grêmio', 'Gremio' ],
	},
	{
		url:      'https://lance.com.br/internacional',
		keywords: [ 'Internacional' ],
	},
	{
		url:      'https://lance.com.br/atletico-mineiro',
		keywords: [ 'Atlético Mineiro', 'Atlético-MG', 'Atletico Mineiro' ],
	},
	{
		url:      'https://lance.com.br/fluminense',
		keywords: [ 'Fluminense' ],
	},
	{
		url:      'https://lance.com.br/botafogo',
		keywords: [ 'Botafogo' ],
	},
	{
		url:      'https://lance.com.br/bahia',
		keywords: [ 'EC Bahia', 'Bahia' ],
	},
	{
		url:      'https://lance.com.br/fortaleza',
		keywords: [ 'Fortaleza EC', 'Fortaleza' ],
	},
	{
		url:      'https://lance.com.br/athletico-paranaense',
		keywords: [ 'Athletico Paranaense', 'Athletico-PR' ],
	},

	// ── Utilidades ────────────────────────────────────────────────────────────
	{
		url:      'https://lance.com.br/tudo-sobre/jogos-de-hoje',
		keywords: [ 'jogos de hoje', 'Jogos de Hoje' ],
	},
	{
		url:      'https://lance.com.br/temporeal/agenda',
		keywords: [ 'agenda esportiva', 'Agenda Esportiva' ],
	},
];
