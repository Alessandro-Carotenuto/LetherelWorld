# Gestione locale Letherel

Apri `index.html` in Chrome o Edge, premi **Collega cartella** e seleziona la cartella principale `LetherelWorld`.

Il tool scrive localmente i file scelti tramite il selettore del browser. Puoi creare, modificare e rimuovere schede e missioni:

- Personaggi: `assets/data/player-cards/*.json`, `index.json` e `roster.json`.
- Bacheca: `assets/data/bacheca.json`.
- Info: `assets/data/info.json`, con titolo, sottotitoli, paragrafi ed elenchi puntati.

Il browser chiede accesso alla cartella. Non vengono inviati dati online. Dopo le modifiche, ricarica il sito per vedere gli aggiornamenti. Per pubblicarli su GitHub Pages, controlla e invia i file modificati come fai normalmente.

Usa i pulsanti freccia per cambiare l’ordine dei personaggi dentro ogni rango e delle missioni nella Bacheca. Rimuovere un personaggio elimina il suo JSON; non elimina immagini o file audio associati.

## Carte stampabili

Apri **Carte** per creare carte di equipaggiamento, creature e incantesimi in italiano. Aggiungi fino a nove preset al foglio di stampa, anche più copie dello stesso preset, poi stampa il foglio A4.

I preset si salvano in `local-admin/schede-stampabili.json`. La cartella `local-admin` è esclusa da Git e i preset non vengono pubblicati con il sito.
