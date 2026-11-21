export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      beheer_sessies: {
        Row: {
          geldig_tot: string
          ingetrokken_op: string | null
          ontgrendeld_op: string
          session_id: string
          user_id: string
        }
        Insert: {
          geldig_tot?: string
          ingetrokken_op?: string | null
          ontgrendeld_op?: string
          session_id: string
          user_id: string
        }
        Update: {
          geldig_tot?: string
          ingetrokken_op?: string | null
          ontgrendeld_op?: string
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      case_aanvragen: {
        Row: {
          payload: Json
          request_id: string
          session_id: string
          station_id: string
          user_id: string
        }
        Insert: {
          payload: Json
          request_id: string
          session_id: string
          station_id: string
          user_id: string
        }
        Update: {
          payload?: Json
          request_id?: string
          session_id?: string
          station_id?: string
          user_id?: string
        }
        Relationships: []
      }
      categorie_instellingen: {
        Row: {
          categorie_id: number
          created_at: string | null
          id: string
          instructie: string | null
          naam: string | null
          tip: string | null
          updated_at: string | null
          volgorde: number | null
        }
        Insert: {
          categorie_id: number
          created_at?: string | null
          id?: string
          instructie?: string | null
          naam?: string | null
          tip?: string | null
          updated_at?: string | null
          volgorde?: number | null
        }
        Update: {
          categorie_id?: number
          created_at?: string | null
          id?: string
          instructie?: string | null
          naam?: string | null
          tip?: string | null
          updated_at?: string | null
          volgorde?: number | null
        }
        Relationships: []
      }
      categorie_opmerkingen: {
        Row: {
          categorie: string
          created_at: string | null
          id: string
          opmerking: string
          station_id: string
          updated_at: string | null
        }
        Insert: {
          categorie: string
          created_at?: string | null
          id?: string
          opmerking: string
          station_id: string
          updated_at?: string | null
        }
        Update: {
          categorie?: string
          created_at?: string | null
          id?: string
          opmerking?: string
          station_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categorie_opmerkingen_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "case_overzicht"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorie_opmerkingen_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      categorie_skips: {
        Row: {
          categorie: string
          created_at: string
          id: string
          reden: string
          station_id: string
          updated_at: string
        }
        Insert: {
          categorie: string
          created_at?: string
          id?: string
          reden: string
          station_id: string
          updated_at?: string
        }
        Update: {
          categorie?: string
          created_at?: string
          id?: string
          reden?: string
          station_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorie_skips_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "case_overzicht"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorie_skips_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      categorie_voorbeelden: {
        Row: {
          categorie: string
          created_at: string | null
          id: string
          storage_path: string
          url: string
        }
        Insert: {
          categorie: string
          created_at?: string | null
          id?: string
          storage_path: string
          url: string
        }
        Update: {
          categorie?: string
          created_at?: string | null
          id?: string
          storage_path?: string
          url?: string
        }
        Relationships: []
      }
      fotos: {
        Row: {
          categorie: string
          created_at: string | null
          gps_afstand_m: number | null
          id: string
          review_reden: string | null
          review_status: string
          reviewed_at: string | null
          scherpte: string | null
          station_id: string
          storage_path: string
          uploaded_at: string | null
          url: string
          volgorde: number | null
        }
        Insert: {
          categorie: string
          created_at?: string | null
          gps_afstand_m?: number | null
          id?: string
          review_reden?: string | null
          review_status?: string
          reviewed_at?: string | null
          scherpte?: string | null
          station_id: string
          storage_path: string
          uploaded_at?: string | null
          url: string
          volgorde?: number | null
        }
        Update: {
          categorie?: string
          created_at?: string | null
          gps_afstand_m?: number | null
          id?: string
          review_reden?: string | null
          review_status?: string
          reviewed_at?: string | null
          scherpte?: string | null
          station_id?: string
          storage_path?: string
          uploaded_at?: string | null
          url?: string
          volgorde?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fotos_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "case_overzicht"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fotos_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      hold_periodes: {
        Row: {
          begin_op: string | null
          einde_op: string | null
          id: string
          partij: Database["public"]["Enums"]["on_hold_partij"]
          reden: string
          station_id: string
          verwacht_op: string | null
        }
        Insert: {
          begin_op?: string | null
          einde_op?: string | null
          id?: string
          partij: Database["public"]["Enums"]["on_hold_partij"]
          reden: string
          station_id: string
          verwacht_op?: string | null
        }
        Update: {
          begin_op?: string | null
          einde_op?: string | null
          id?: string
          partij?: Database["public"]["Enums"]["on_hold_partij"]
          reden?: string
          station_id?: string
          verwacht_op?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hold_periodes_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "case_overzicht"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hold_periodes_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      instellingen: {
        Row: {
          accent_gold_color: string | null
          background_color: string | null
          bedrijfsnaam: string | null
          created_at: string | null
          id: string
          logo_url: string | null
          orange_color: string | null
          primary_color: string | null
          primary_light_color: string | null
          profielfoto_url: string | null
          regio: string | null
          sp_auth_fout: string | null
          sp_gecontroleerd_op: string | null
          sp_machtigingen_nodig: string[]
          sp_sleutel_automatisch: boolean
          sp_sleutel_verloopt_op: string | null
          updated_at: string | null
        }
        Insert: {
          accent_gold_color?: string | null
          background_color?: string | null
          bedrijfsnaam?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          orange_color?: string | null
          primary_color?: string | null
          primary_light_color?: string | null
          profielfoto_url?: string | null
          regio?: string | null
          sp_auth_fout?: string | null
          sp_gecontroleerd_op?: string | null
          sp_machtigingen_nodig?: string[]
          sp_sleutel_automatisch?: boolean
          sp_sleutel_verloopt_op?: string | null
          updated_at?: string | null
        }
        Update: {
          accent_gold_color?: string | null
          background_color?: string | null
          bedrijfsnaam?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          orange_color?: string | null
          primary_color?: string | null
          primary_light_color?: string | null
          profielfoto_url?: string | null
          regio?: string | null
          sp_auth_fout?: string | null
          sp_gecontroleerd_op?: string | null
          sp_machtigingen_nodig?: string[]
          sp_sleutel_automatisch?: boolean
          sp_sleutel_verloopt_op?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      monteurs: {
        Row: {
          created_at: string | null
          id: string
          naam: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          naam: string
        }
        Update: {
          created_at?: string | null
          id?: string
          naam?: string
        }
        Relationships: []
      }
      opdrachtgevers: {
        Row: {
          created_at: string
          id: string
          naam: string
        }
        Insert: {
          created_at?: string
          id?: string
          naam: string
        }
        Update: {
          created_at?: string
          id?: string
          naam?: string
        }
        Relationships: []
      }
      opleverruns: {
        Row: {
          aangevraagd_door: string | null
          afgerond_op: string | null
          bijgewerkt_op: string
          dossier: Json | null
          fout: string | null
          gestart_op: string
          html_pad: string | null
          id: string
          lease_id: string | null
          lease_tot: string | null
          pdf_hash: string | null
          pdf_pad: string | null
          pdf_run: string | null
          poging: number
          retry_stap: string | null
          stap_fouten: Json
          station_id: string
          status: string
          volgende_poging_op: string | null
        }
        Insert: {
          aangevraagd_door?: string | null
          afgerond_op?: string | null
          bijgewerkt_op?: string
          dossier?: Json | null
          fout?: string | null
          gestart_op?: string
          html_pad?: string | null
          id?: string
          lease_id?: string | null
          lease_tot?: string | null
          pdf_hash?: string | null
          pdf_pad?: string | null
          pdf_run?: string | null
          poging?: number
          retry_stap?: string | null
          stap_fouten?: Json
          station_id: string
          status?: string
          volgende_poging_op?: string | null
        }
        Update: {
          aangevraagd_door?: string | null
          afgerond_op?: string | null
          bijgewerkt_op?: string
          dossier?: Json | null
          fout?: string | null
          gestart_op?: string
          html_pad?: string | null
          id?: string
          lease_id?: string | null
          lease_tot?: string | null
          pdf_hash?: string | null
          pdf_pad?: string | null
          pdf_run?: string | null
          poging?: number
          retry_stap?: string | null
          stap_fouten?: Json
          station_id?: string
          status?: string
          volgende_poging_op?: string | null
        }
        Relationships: []
      }
      pin_pogingen: {
        Row: {
          gelukt: boolean
          id: number
          sleutel: string
          tijd: string
        }
        Insert: {
          gelukt?: boolean
          id?: number
          sleutel: string
          tijd?: string
        }
        Update: {
          gelukt?: boolean
          id?: number
          sleutel?: string
          tijd?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          user_label: string | null
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          user_label?: string | null
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          user_label?: string | null
        }
        Relationships: []
      }
      rapport_pdf: {
        Row: {
          bytes: number | null
          fotos: number | null
          fout: string | null
          geaccepteerde_run: string | null
          gestart_op: string
          klaar_op: string | null
          paginas: number | null
          pdf_hash: string | null
          pdf_pad: string | null
          station_id: string
          status: string
        }
        Insert: {
          bytes?: number | null
          fotos?: number | null
          fout?: string | null
          geaccepteerde_run?: string | null
          gestart_op?: string
          klaar_op?: string | null
          paginas?: number | null
          pdf_hash?: string | null
          pdf_pad?: string | null
          station_id: string
          status?: string
        }
        Update: {
          bytes?: number | null
          fotos?: number | null
          fout?: string | null
          geaccepteerde_run?: string | null
          gestart_op?: string
          klaar_op?: string | null
          paginas?: number | null
          pdf_hash?: string | null
          pdf_pad?: string | null
          station_id?: string
          status?: string
        }
        Relationships: []
      }
      sharepoint_sync: {
        Row: {
          aantal_bestanden: number
          fout: string | null
          gesynct_op: string
          pdf_hash: string | null
          pdf_run: string | null
          sharepoint_item_id: string | null
          sharepoint_url: string | null
          station_id: string
          status: string
        }
        Insert: {
          aantal_bestanden?: number
          fout?: string | null
          gesynct_op?: string
          pdf_hash?: string | null
          pdf_run?: string | null
          sharepoint_item_id?: string | null
          sharepoint_url?: string | null
          station_id: string
          status?: string
        }
        Update: {
          aantal_bestanden?: number
          fout?: string | null
          gesynct_op?: string
          pdf_hash?: string | null
          pdf_run?: string | null
          sharepoint_item_id?: string | null
          sharepoint_url?: string | null
          station_id?: string
          status?: string
        }
        Relationships: []
      }
      sharepoint_sync_runs: {
        Row: {
          fouten: Json
          gestart_op: string
          handmatig: boolean
          id: string
          klaar_op: string | null
          stations: number
          toegevoegd: number
          verplaatst: number
          verwijderd: number
        }
        Insert: {
          fouten?: Json
          gestart_op?: string
          handmatig?: boolean
          id?: string
          klaar_op?: string | null
          stations?: number
          toegevoegd?: number
          verplaatst?: number
          verwijderd?: number
        }
        Update: {
          fouten?: Json
          gestart_op?: string
          handmatig?: boolean
          id?: string
          klaar_op?: string | null
          stations?: number
          toegevoegd?: number
          verplaatst?: number
          verwijderd?: number
        }
        Relationships: []
      }
      sharepoint_wachtrij: {
        Row: {
          aanvraag_id: string
          alleen_status: boolean
          fout: string | null
          poging: number
          station_id: string
          volgende_poging_op: string
        }
        Insert: {
          aanvraag_id?: string
          alleen_status?: boolean
          fout?: string | null
          poging?: number
          station_id: string
          volgende_poging_op?: string
        }
        Update: {
          aanvraag_id?: string
          alleen_status?: boolean
          fout?: string | null
          poging?: number
          station_id?: string
          volgende_poging_op?: string
        }
        Relationships: []
      }
      station_verwerking: {
        Row: {
          eigenaar: string | null
          geldig_tot: string | null
          generatie: number
          station_id: string
        }
        Insert: {
          eigenaar?: string | null
          geldig_tot?: string | null
          generatie?: number
          station_id: string
        }
        Update: {
          eigenaar?: string | null
          geldig_tot?: string | null
          generatie?: number
          station_id?: string
        }
        Relationships: []
      }
      stations: {
        Row: {
          behuizingsnummer: string | null
          case_verborgen: boolean
          casenaam: string | null
          casenummer: string | null
          created_at: string | null
          da_kast: boolean | null
          datum: string | null
          dossier_notitie: string | null
          dossier_notitie_versie: number
          dossier_status: string
          id: string
          ingevuld_door: string | null
          is_nummer: string | null
          naam_msr: string
          on_hold: boolean
          on_hold_partij: Database["public"]["Enums"]["on_hold_partij"] | null
          on_hold_reden: string | null
          on_hold_sinds: string | null
          on_hold_tot: string | null
          opdrachtgever: string | null
          review_reden: string | null
          status: string | null
          submitted_at: string | null
          submitted_by: string | null
          tg: boolean
          type_ruimte: string | null
          uitvoerder: Database["public"]["Enums"]["case_uitvoerder"]
          updated_at: string | null
          vermogensveld: boolean | null
          wv: string | null
        }
        Insert: {
          behuizingsnummer?: string | null
          case_verborgen?: boolean
          casenaam?: string | null
          casenummer?: string | null
          created_at?: string | null
          da_kast?: boolean | null
          datum?: string | null
          dossier_notitie?: string | null
          dossier_notitie_versie?: number
          dossier_status?: string
          id?: string
          ingevuld_door?: string | null
          is_nummer?: string | null
          naam_msr: string
          on_hold?: boolean
          on_hold_partij?: Database["public"]["Enums"]["on_hold_partij"] | null
          on_hold_reden?: string | null
          on_hold_sinds?: string | null
          on_hold_tot?: string | null
          opdrachtgever?: string | null
          review_reden?: string | null
          status?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          tg?: boolean
          type_ruimte?: string | null
          uitvoerder?: Database["public"]["Enums"]["case_uitvoerder"]
          updated_at?: string | null
          vermogensveld?: boolean | null
          wv?: string | null
        }
        Update: {
          behuizingsnummer?: string | null
          case_verborgen?: boolean
          casenaam?: string | null
          casenummer?: string | null
          created_at?: string | null
          da_kast?: boolean | null
          datum?: string | null
          dossier_notitie?: string | null
          dossier_notitie_versie?: number
          dossier_status?: string
          id?: string
          ingevuld_door?: string | null
          is_nummer?: string | null
          naam_msr?: string
          on_hold?: boolean
          on_hold_partij?: Database["public"]["Enums"]["on_hold_partij"] | null
          on_hold_reden?: string | null
          on_hold_sinds?: string | null
          on_hold_tot?: string | null
          opdrachtgever?: string | null
          review_reden?: string | null
          status?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          tg?: boolean
          type_ruimte?: string | null
          uitvoerder?: Database["public"]["Enums"]["case_uitvoerder"]
          updated_at?: string | null
          vermogensveld?: boolean | null
          wv?: string | null
        }
        Relationships: []
      }
      to_acties: {
        Row: {
          afgehandeld_op: string | null
          bij: string
          created_at: string
          derde_naam: string | null
          id: string
          notitie: string | null
          omschrijving: string
          ronde_id: string
          station_id: string
        }
        Insert: {
          afgehandeld_op?: string | null
          bij: string
          created_at?: string
          derde_naam?: string | null
          id?: string
          notitie?: string | null
          omschrijving: string
          ronde_id: string
          station_id: string
        }
        Update: {
          afgehandeld_op?: string | null
          bij?: string
          created_at?: string
          derde_naam?: string | null
          id?: string
          notitie?: string | null
          omschrijving?: string
          ronde_id?: string
          station_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "to_acties_ronde_id_fkey"
            columns: ["ronde_id"]
            isOneToOne: false
            referencedRelation: "to_rondes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "to_acties_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "case_overzicht"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "to_acties_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      to_rondes: {
        Row: {
          created_at: string
          id: string
          ingediend_bij: string | null
          ingediend_op: string | null
          notitie: string | null
          nummer: number
          reactie_op: string | null
          redenen: string[]
          station_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingediend_bij?: string | null
          ingediend_op?: string | null
          notitie?: string | null
          nummer: number
          reactie_op?: string | null
          redenen?: string[]
          station_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          ingediend_bij?: string | null
          ingediend_op?: string | null
          notitie?: string | null
          nummer?: number
          reactie_op?: string | null
          redenen?: string[]
          station_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "to_rondes_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "case_overzicht"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "to_rondes_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      case_overzicht: {
        Row: {
          id: string | null
          rondes: Json | null
          station: Json | null
        }
        Insert: {
          id?: string | null
          rondes?: never
          station?: never
        }
        Update: {
          id?: string | null
          rondes?: never
          station?: never
        }
        Relationships: []
      }
    }
    Functions: {
      beheer_deadline_geldig: {
        Args: { _ingetrokken: string; _nu: string; _tot: string }
        Returns: boolean
      }
      beheer_status: { Args: never; Returns: string }
      beheer_toestaan: {
        Args: { _session_id: string; _user_id: string }
        Returns: string
      }
      beheer_vergrendelen: { Args: never; Returns: boolean }
      case_aanmaken: {
        Args: { _payload: Json; _request_id: string }
        Returns: Json
      }
      case_hold_hervat: {
        Args: { _periode_id: string; _station_id: string }
        Returns: boolean
      }
      case_hold_start: {
        Args: {
          _partij: Database["public"]["Enums"]["on_hold_partij"]
          _periode_id: string
          _reden: string
          _station_id: string
          _verwacht?: string
        }
        Returns: string
      }
      case_notitie_opslaan: {
        Args: { _station_id: string; _tekst: string; _versie: number }
        Returns: Json
      }
      case_wv_suggesties: {
        Args: never
        Returns: {
          wv: string
        }[]
      }
      categorienotitie_opslaan: {
        Args: { _categorie: string; _station_id: string; _tekst: string }
        Returns: boolean
      }
      dossier_snapshot: { Args: { _station_id: string }; Returns: Json }
      foto_pad_toegestaan: { Args: { _pad: string }; Returns: boolean }
      fotodossier_aanbieden: {
        Args: {
          _opdrachtgever?: string
          _station_id: string
          _submitted_by?: string
        }
        Returns: Json
      }
      fotowerk_toegestaan: { Args: { _id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      heeft_beheer: { Args: never; Returns: boolean }
      maak_case: {
        Args: {
          _casenaam: string
          _casenummer: string
          _ingediend_op?: string
          _notitie?: string
          _on_hold?: boolean
          _on_hold_reden?: string
          _ronde?: number
          _to_status?: string
          _uitvoerder?: Database["public"]["Enums"]["case_uitvoerder"]
          _wv?: string
        }
        Returns: string
      }
      monteur_station: { Args: { _id: string }; Returns: boolean }
      opleverrun_claim: {
        Args: { _id: string; _seconden: number }
        Returns: string
      }
      opleverrun_retry: { Args: { _id: string }; Returns: boolean }
      opleverrun_verweesd: { Args: { _id: string }; Returns: boolean }
      sharepoint_uitstellen: {
        Args: { _alleen_status?: boolean; _fout?: string; _station_id: string }
        Returns: undefined
      }
      station_claim: {
        Args: {
          _eigenaar: string
          _run?: string
          _seconden?: number
          _station_id: string
        }
        Returns: number
      }
      station_claim_check: {
        Args: {
          _eigenaar: string
          _generatie: number
          _station_id: string
          _vrijgeven?: boolean
        }
        Returns: boolean
      }
      uitvoerbare_opleverruns: {
        Args: { _limiet?: number; _station_id?: string }
        Returns: {
          aangevraagd_door: string | null
          afgerond_op: string | null
          bijgewerkt_op: string
          dossier: Json | null
          fout: string | null
          gestart_op: string
          html_pad: string | null
          id: string
          lease_id: string | null
          lease_tot: string | null
          pdf_hash: string | null
          pdf_pad: string | null
          pdf_run: string | null
          poging: number
          retry_stap: string | null
          stap_fouten: Json
          station_id: string
          status: string
          volgende_poging_op: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "opleverruns"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      url_candidates: {
        Args: { _key?: string; _og?: string }
        Returns: {
          behuizingsnummer: string
          casenaam: string
          casenummer: string
          created_at: string
          datum: string
          id: string
          naam_msr: string
          opdrachtgever: string
          submitted_at: string
          uitvoerder: Database["public"]["Enums"]["case_uitvoerder"]
        }[]
      }
      url_slug: { Args: { _tekst: string }; Returns: string }
      vereiste_fotocategorieen: {
        Args: { _station: Database["public"]["Tables"]["stations"]["Row"] }
        Returns: {
          id: number
          minimum: number
          naam: string
        }[]
      }
      verwerking_opslaan: {
        Args: {
          _eigenaar: string
          _generatie: number
          _pdf_patch?: Json
          _run?: string
          _run_patch?: Json
          _station_id: string
          _sync_patch?: Json
        }
        Returns: boolean
      }
      verwerking_snapshot: {
        Args: {
          _eigenaar: string
          _generatie: number
          _run: string
          _station_id: string
        }
        Returns: Json
      }
      verwerking_wachtrij_klaar:
        | {
            Args: { _eigenaar: string; _generatie: number; _station_id: string }
            Returns: boolean
          }
        | {
            Args: {
              _aanvraag_id: string
              _alleen_status: boolean
              _eigenaar: string
              _generatie: number
              _station_id: string
            }
            Returns: boolean
          }
      verwerking_wachtrij_snapshot: {
        Args: { _eigenaar: string; _generatie: number; _station_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin"
      case_uitvoerder: "terrevolt" | "van_gelder"
      on_hold_partij: "terrevolt" | "van_gelder" | "liander" | "derden"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin"],
      case_uitvoerder: ["terrevolt", "van_gelder"],
      on_hold_partij: ["terrevolt", "van_gelder", "liander", "derden"],
    },
  },
} as const
