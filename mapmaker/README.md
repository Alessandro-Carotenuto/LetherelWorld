# Mapmaker di Letherel

Apri `index.html` nel browser: si carica il preset ricostruito dalle immagini di riferimento, con la mappa colorata e i confini territoriali. Include 20 territori: Igglopolt, Likari, Gray, Dalinar, Tusk, Sewerly, Tikle, Barlon, Galvànt, Alaven, Revachòl, Whiteflower, Allomance, Lavender, Brightforge, Pages, Mankos, Obsidian, Falkner e La Confraternita.

Ogni riga permette di rinominare il territorio, cambiare il colore del pennello e attivare o disattivare la sua etichetta. I colori iniziali corrispondono ai riempimenti effettivi delle casate nella mappa. Il pennello parte al 100% per riprodurre esattamente il colore scelto; lo slider **Opacità pennello** permette di ridurla senza sommare trasparenza nelle sovrapposizioni. Il contorno viene tracciato all’esterno dell’intero tratto visibile, si fonde con le casate già dello stesso colore e ripulisce i vecchi confini coperti. Il tratto si ferma quando esce dalla terra e riprende quando rientra; lo slider **Frastagliazione** controlla quanto è irregolare il bordo. **Ripristina preset Letherel** ricarica la mappa originale e annulla le modifiche correnti.

Il progetto viene salvato automaticamente nel browser. **Esporta progetto** crea un JSON riapribile con **Apri progetto**; **Esporta mappa** produce un PNG con immagine, colori ed etichette visibili.

La cartella non dipende dalla dashboard in `local-admin` e non modifica i dati del sito: serve a preparare mappe autonome da usare come immagini. La base dei territori conserva i confini e i riempimenti della seconda immagine di riferimento; le etichette sono livelli separati.
