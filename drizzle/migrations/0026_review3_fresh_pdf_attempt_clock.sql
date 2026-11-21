CREATE FUNCTION public.pdf_poging_startklok() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NEW.status='pdf_bezig' AND OLD.status IS DISTINCT FROM NEW.status THEN
 NEW.pdf_poging_op:=clock_timestamp(); NEW.pdf_voortgang_op:=clock_timestamp(); NEW.pdf_volgende_op:=clock_timestamp(); NEW.pdf_run:=NEW.pdf_poging_op::text;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pdf_poging_startklok BEFORE UPDATE ON public.opleverruns FOR EACH ROW EXECUTE FUNCTION public.pdf_poging_startklok();