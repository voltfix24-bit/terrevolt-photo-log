# Apple-kwaliteit verfijningsronde

## Doel
De homepage, het projectdetail en het taakscherm terugbrengen tot één rustige TerreVolt-vormentaal. Bestaande data, routes, states, sleutels, hooks en handelingen blijven ongewijzigd.

## Aanpassingen

### Gedeelde vormtaal
- De opgegeven kleuren, radii, rijhoogte, inspringingen en bewegingscurves als vaste gedeelde waarden toepassen.
- Eén consistente drukanimatie en glasbalk voor navigatie en primaire acties gebruiken.
- Achtergrond instellen op `#E8F2E2`; witte oppervlakken zonder rand tonen.
- Bestaande verminderde-beweging- en glasfallback behouden en afstemmen op de nieuwe achtergrond.

### Homepage
- Losse projectkaarten behouden, maar alle randen verwijderen behalve de groene rand van de geopende kaart.
- Radius naar 16px brengen en overbodige pillen/omkadering uit secundaire elementen verwijderen.
- Zoekbalk en onderste balk visueel gelijkmaken aan de gedeelde primitives.
- De vier bestaande acties exact behouden: Invullen, Pdf, Delen, Wis.
- De bestaande synchronisatiestatus, zoekfunctie, verwijderbevestiging en navigatie intact laten.

### Projectdetail
- Navigatie terugbrengen tot platte tekstacties bovenin.
- Titel en groot aantal resterende taken de hiërarchie laten dragen; percentage, voortgangsbalk en typebadge verwijderen.
- Iedere sectie als één witte groep tonen; categorieën worden rijen binnen die groep.
- Scheidingslijnen 17px laten inspringen onder groepskoppen en 54px tussen rijen met icoon.
- Statusiconen los tonen: groen voor open, grijsgroen voor afgerond, grijs voor nvt; geen tegels, badges of geneste witte vlakken.
- Onderaan precies één gevulde primaire actie tonen.

### Taakscherm
- Bovenbalk terugbrengen tot Sluit, stapnummer en Nvt als platte tekstacties.
- Taaktitel en instructie als gewone tekst op de groene achtergrond plaatsen; instructieblok en statusbadges verwijderen.
- Voorbeeldfoto en opmerking samen als rijen in één witte groep tonen.
- Foto-opname als één zelfstandig wit vlak zonder rand of gekleurd icoontegeltje tonen.
- Bestaande upload, galerij, voorbeeldfoto, opmerkingen/autosave, NVT-redenen, foto-preview/verwijderen en vorige/volgende-besturing behouden.
- Onderaan precies één gevulde primaire actie tonen; vorige blijft een ongevulde bediening.

## Controle
- Op 360px testen met een stationsnaam van minimaal 40 tekens.
- Controleren dat er geen horizontale overloop is en alle rijen minimaal 58px hoog zijn.
- Controleren dat witte vlakken niet in witte vlakken staan, hairlines correct inspringen en alleen de actieve homepagekaart een rand heeft.
- Projectdetail en taakscherm naast elkaar controleren op gelijke rijhoogtes, inspringingen en tekstgroottes.
- Bestaande acties doorlopen en de actuele foutmeldingen en bouwstatus controleren.
