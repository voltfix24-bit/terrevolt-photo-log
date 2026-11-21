REVOKE ALL PRIVILEGES ON TABLE public.beheer_sessies FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.beheer_sessies TO service_role;