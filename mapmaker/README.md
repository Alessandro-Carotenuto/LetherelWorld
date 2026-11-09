# Mapmaker di Letherel

Apri `index.html` nel browser: si carica il preset ricostruito dalle immagini di riferimento, con la mappa colorata e i confini territoriali. Include 20 territori: Igglopolt, Likari, Gray, Dalinar, Tusk, Sewerly, Tikle, Barlon, Galvànt, Alaven, Revachòl, Whiteflower, Allomance, Lavender, Brightforge, Pages, Mankos, Obsidian, Falkner e La Confraternita.

Ogni riga permette di rinominare il territorio, cambiare il colore del pennello e attivare o disattivare la sua etichetta. Seleziona uno Stato e dipingi sulla mappa per aggiungere pennellate: il contorno viene tracciato solo sul lato esterno della nuova zona e conserva lo spessore dei confini della mappa. Se dipingi con il colore dello Stato già presente, il suo confine originale resta al suo posto senza crearne uno nuovo all’interno. Le aree adiacenti dello stesso colore si fondono e le pennellate sovrapposte non aumentano l’opacità. Il tratto si ferma quando esce dalla terra e riprende quando rientra; lo slider **Frastagliazione** controlla quanto è irregolare il bordo. **Ripristina preset Letherel** ricarica la mappa originale e annulla le modifiche correnti.

Il progetto viene salvato automaticamente nel browser. **Esporta progetto** crea un JSON riapribile con **Apri progetto**; **Esporta mappa** produce un PNG con immagine, colori ed etichette visibili.

La cartella non dipende dalla dashboard in `local-admin` e non modifica i dati del sito: serve a preparare mappe autonome da usare come immagini. La base dei territori conserva i confini e i riempimenti della seconda immagine di riferimento; le etichette sono livelli separati.
