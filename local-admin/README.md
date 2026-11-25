# Gestione locale Letherel

Apri `index.html` in Chrome o Edge, premi **Collega cartella** e seleziona la cartella principale `LetherelWorld`.

Il tool scrive localmente i file scelti tramite il selettore del browser. Puoi creare, modificare e rimuovere schede e missioni:

- Personaggi: `assets/data/player-cards/*.json`, `index.json` e `roster.json`.
- Bacheca: `assets/data/bacheca.json`.
- Info: `assets/data/info.json`, con titolo, sottotitoli, paragrafi ed elenchi puntati.

Il browser chiede accesso alla cartella. Non vengono inviati dati online. Dopo le modifiche, ricarica il sito per vedere gli aggiornamenti. Per pubblicarli su GitHub Pages, controlla e invia i file modificati come fai normalmente.

Usa i pulsanti freccia per cambiare l’ordine dei personaggi dentro ogni rango e delle missioni nella Bacheca. Rimuovere un personaggio elimina il suo JSON; non elimina immagini o file audio associati.

## Carte stampabili

Apri **Carte** per creare carte di equipaggiamento, creature e incantesimi in italiano. Scarica la carta in anteprima o un preset salvato come immagine PNG; **Duplica** apre un nuovo preset con gli stessi dati, da modificare e salvare separatamente. Aggiungi fino a nove preset al foglio di stampa, anche più copie dello stesso preset, poi stampa il foglio A4.

I preset si salvano in `local-admin/schede-stampabili.json`, file versionato nel repository.

## Musica e atmosfere

Nella versione online della dashboard premi **Collega cartella Musica** e seleziona la cartella `music-dashboard/music/` del tuo computer. I brani vengono letti nel browser senza essere caricati su GitHub. Se la cartella contiene `ambience/`, quei brani compaiono anche nell'Ambience Deck; puoi inoltre usare **Collega cartella Ambience** per la cartella separata `music-dashboard/ambience/`. Dopo aver riaperto la pagina devi selezionare nuovamente le cartelle. Le playlist restano salvate nel browser usato per il sito online e sono separate da quelle dell'indirizzo locale. Download YouTube e rinomina dei file richiedono il server locale.

Avvia `Avvia-LetherelWorld.bat` dalla cartella principale, poi apri **Musica** nel Local Admin. Il sito e la dashboard musicale usano lo stesso server locale sulla porta 8765. Metti i brani in `music-dashboard/music/`. Per le atmosfere puoi usare `music-dashboard/ambience/` oppure scrivere `ambience` nel campo **Save to Folder** del download YouTube: in questo caso i file finiscono in `music-dashboard/music/ambience/` e compaiono nell'Ambience Deck. La libreria include anche `assets/audio/` del sito. Puoi impostare `music_folder` in `music-dashboard/config.json` per usare una cartella musicale diversa. Le playlist sono salvate nel browser per l'indirizzo locale del sito. Per il download da YouTube servono yt-dlp e ffmpeg.

Se YouTube restituisce un errore, leggilo nella scheda Download. Aggiorna yt-dlp con `python -m pip install -U "yt-dlp[default]"` e riavvia `Avvia-LetherelWorld.bat`: la versione installata deve restare compatibile con i cambiamenti di YouTube.

Se appare **“Sign in to confirm you’re not a bot”**, scegli nel modulo il browser in cui hai aperto YouTube e riprova. La scelta usa `--cookies-from-browser` solo per quel download; non crea un file di cookie nel progetto. Usa questa opzione solo quando richiesta, perché yt-dlp leggerà i cookie del profilo selezionato.

Nella scheda YouTube puoi indicare il nome del file senza `.mp3`; per scaricare tutti i video di una playlist attiva **Scarica tutta la playlist**. Il nome personalizzato diventa un prefisso per i brani numerati. Dopo il download, il player aspetta che finisca anche la conversione MP3. I pulsanti **Rinomina** in Libreria, nella playlist selezionata e nell'Ambience Deck cambiano il nome del file sul disco e aggiornano i riferimenti nelle playlist locali. Per gli audio in `assets/audio/`, vengono aggiornati anche i percorsi nei JSON del sito.
