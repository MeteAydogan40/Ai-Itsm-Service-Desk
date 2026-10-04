-- ============================================================
-- KURULUM — AI Destekli ITSM Destek Masası
-- ============================================================
-- Supabase → SQL Editor → bu dosyanın tamamını yapıştır → Run
--
-- Tek seferde çalışır: tablolar, indeksler, fonksiyonlar,
-- güvenlik politikaları ve başlangıç bilgi bankası.
--
-- Tekrar çalıştırmak güvenlidir; mevcut veriyi silmez
-- ("if not exists" ve "on conflict do nothing" kullanılıyor).
--
-- Kurulumdan sonra:
--   1. Edge Function'ı yayına alın
--   2. Uygulamaya yönetici olarak girip
--      Yönetim → Sistem → "Eksik vektörleri tamamla"
--      (vektörler yapay zeka servisinden geçtiği için SQL ile üretilemiyor)
-- ============================================================

create extension if not exists vector;
create extension if not exists "uuid-ossp";


-- ============================================================
-- 1) TABLOLAR
-- ============================================================

-- Çağrılar ve talepler
create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_no text unique not null,
  reporter_name text not null,
  title text not null,
  description text,

  -- Sınıflandırma (yapay zeka dolduruyor)
  ticket_type text default 'Olay',        -- Olay | Talep | Değişiklik
  category text,
  sub_category text,
  affected_system text,
  support_group text,
  impact text default 'Orta',
  priority text default 'Orta',
  priority_reason text,

  -- Durum
  status text default 'Açık',             -- Açık | İşlemde | Çözüldü
  assignee text,
  resolution_note text,
  tried_steps jsonb default '[]'::jsonb,
  source_kb_ids uuid[] default '{}',

  -- Tekrarlayan problem tespiti
  recurring_flag boolean default false,
  recurring_note text,

  -- Semantik arama
  embedding vector(768),

  created_at timestamptz default now(),
  taken_at timestamptz,
  resolved_at timestamptz
);

-- Asistanla yapılan konuşmanın tamamı
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references tickets(id) on delete cascade,
  role text not null,                     -- user | bot
  content text not null,
  created_at timestamptz default now()
);

-- Bilgi bankası: çözüm kayıtları
create table if not exists knowledge_base (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  keywords text[] default '{}',           -- yalnızca yerel yedek eşleştirme için
  steps jsonb default '[]'::jsonb,
  source text default 'seed',             -- seed | technician | admin

  -- Gerçek sayım: kaç kez önerildi, kaçında işe yaradı
  use_count int default 0,
  success_count int default 0,

  embedding vector(768),
  created_at timestamptz default now()
);

-- Çağrı açılmadan çözülen sorunlar
create table if not exists deflections (
  id uuid primary key default gen_random_uuid(),
  problem_text text,
  category text,
  resolved_at_step int,                   -- kaçıncı adımda çözüldü
  source_kb_id uuid,
  created_at timestamptz default now()
);

-- Destek grupları: yapay zeka yönlendirmeyi bu listeden seçiyor
create table if not exists support_groups (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text,
  created_at timestamptz default now()
);

-- Dosya ekleri ve çıkarılan metinleri
create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references tickets(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  public_url text,
  mime_type text,
  size_bytes bigint,
  uploaded_by text,
  kind text default 'document',           -- document | image | other
  purpose text default 'talep',           -- talep | kanıt
  extracted_text text,
  extraction_status text default 'bekliyor',
  extraction_note text,
  created_at timestamptz default now()
);

-- Dokümandan çıkarılan gereksinimler
create table if not exists requirements (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references tickets(id) on delete cascade,
  attachment_id uuid references attachments(id) on delete set null,
  code text not null,                     -- REQ-01, REQ-02...
  title text not null,
  description text,
  req_type text default 'Fonksiyonel',
  priority text default 'Orta',

  -- İzlenebilirlik: hangi cümleden çıkarıldı
  source_quote text,
  confidence text default 'Orta',

  -- Belirsizlik işareti
  ambiguous boolean default false,
  ambiguity_note text,

  -- İnsan kontrolü
  approved boolean default false,
  edited_by_human boolean default false,

  created_at timestamptz default now()
);

-- Test senaryoları
create table if not exists test_cases (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references tickets(id) on delete cascade,
  requirement_id uuid references requirements(id) on delete cascade,
  code text not null,                     -- TEST-01, TEST-02...
  title text not null,
  test_type text default 'Pozitif',       -- Pozitif | Negatif | Sınır Değer | Yetki | Regresyon
  preconditions text,
  steps jsonb default '[]'::jsonb,
  expected_result text not null,
  is_critical boolean default false,
  critical_reason text,
  created_by text default 'ai',           -- ai | human
  edited_by_human boolean default false,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Test yürütmeleri: her işaretleme ayrı satır, geçmiş üzerine yazılmıyor
create table if not exists test_executions (
  id uuid primary key default gen_random_uuid(),
  test_case_id uuid references test_cases(id) on delete cascade,
  ticket_id uuid references tickets(id) on delete cascade,
  result text not null,                   -- Başarılı | Başarısız | Uygulanamaz
  note text,
  attachment_id uuid references attachments(id) on delete set null,
  executed_by text,
  executed_at timestamptz default now()
);


-- ============================================================
-- 2) İNDEKSLER
-- ============================================================

-- Vektör indeksleri: ivfflat, kosinüs mesafesi
create index if not exists tickets_embedding_idx
  on tickets using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create index if not exists kb_embedding_idx
  on knowledge_base using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create index if not exists attachments_ticket_idx on attachments(ticket_id);
create index if not exists requirements_ticket_idx on requirements(ticket_id);
create index if not exists test_cases_ticket_idx on test_cases(ticket_id);
create index if not exists test_cases_req_idx on test_cases(requirement_id);
create index if not exists test_exec_case_idx on test_executions(test_case_id);
create index if not exists test_exec_ticket_idx on test_executions(ticket_id);


-- ============================================================
-- 3) FONKSİYONLAR
--
-- Benzerlik araması ve kapatma kuralı burada; uygulamada değil.
-- İki sebep: binlerce kaydı tarayıcıya çekmek yerine hesap verinin
-- yanında yapılıyor, ve kural tek bir kaynakta duruyor.
-- ============================================================

create or replace function match_tickets(
  query_embedding vector(768),
  match_count int default 5,
  min_similarity float default 0.5,
  exclude_id uuid default null
)
returns table (
  id uuid,
  ticket_no text,
  title text,
  description text,
  category text,
  priority text,
  status text,
  resolution_note text,
  created_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    t.id, t.ticket_no, t.title, t.description, t.category,
    t.priority, t.status, t.resolution_note, t.created_at,
    1 - (t.embedding <=> query_embedding) as similarity
  from tickets t
  where t.embedding is not null
    and (exclude_id is null or t.id <> exclude_id)
    and 1 - (t.embedding <=> query_embedding) >= min_similarity
  order by t.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function match_knowledge(
  query_embedding vector(768),
  match_count int default 4,
  min_similarity float default 0.35
)
returns table (
  id uuid,
  category text,
  steps jsonb,
  source text,
  use_count int,
  success_count int,
  similarity float
)
language sql stable
as $$
  select
    k.id, k.category, k.steps, k.source,
    k.use_count, k.success_count,
    1 - (k.embedding <=> query_embedding) as similarity
  from knowledge_base k
  where k.embedding is not null
    and 1 - (k.embedding <=> query_embedding) >= min_similarity
  order by k.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function detect_recurring(
  query_embedding vector(768),
  window_hours int default 24,
  min_similarity float default 0.62
)
returns table (
  match_count bigint,
  category text,
  oldest timestamptz,
  newest timestamptz
)
language sql stable
as $$
  select
    count(*) as match_count,
    mode() within group (order by t.category) as category,
    min(t.created_at) as oldest,
    max(t.created_at) as newest
  from tickets t
  where t.embedding is not null
    and t.created_at > now() - (window_hours || ' hours')::interval
    and 1 - (t.embedding <=> query_embedding) >= min_similarity
  having count(*) >= 2;
$$;

create or replace function bump_kb_usage(
  kb_id uuid,
  worked boolean
)
returns void
language sql
as $$
  update knowledge_base
  set use_count = use_count + 1,
      success_count = success_count + case when worked then 1 else 0 end
  where id = kb_id;
$$;

create or replace function check_closure_readiness(p_ticket_id uuid)
returns table (
  total_tests bigint,
  critical_tests bigint,
  critical_passed bigint,
  critical_failed bigint,
  critical_pending bigint,
  can_close boolean
)
language sql stable
as $$
  with t as (
    select
      tc.id,
      tc.is_critical,
      s.result
    from test_cases tc
    left join test_latest_status s on s.test_case_id = tc.id
    where tc.ticket_id = p_ticket_id
  )
  select
    count(*) as total_tests,
    count(*) filter (where is_critical) as critical_tests,
    count(*) filter (where is_critical and result = 'Başarılı') as critical_passed,
    count(*) filter (where is_critical and result = 'Başarısız') as critical_failed,
    count(*) filter (where is_critical and (result is null)) as critical_pending,
    -- Kapatılabilir: hiç test yoksa (arıza çağrıları) ya da
    -- tüm kritik testler Başarılı/Uygulanamaz olarak işaretlendiyse
    (
      count(*) = 0
      or (
        count(*) filter (where is_critical and result = 'Başarısız') = 0
        and count(*) filter (where is_critical and result is null) = 0
      )
    ) as can_close
  from t;
$$;

create or replace function estimate_resolution(
  query_embedding vector(768) default null,
  p_category text default null,
  exclude_id uuid default null,
  min_similarity float default 0.45,
  min_sample int default 3
)
returns table (
  basis text,
  sample_size bigint,
  avg_minutes numeric,
  median_minutes numeric,
  fastest_minutes numeric,
  slowest_minutes numeric
)
language plpgsql
stable
as $$
declare
  semantic_count bigint := 0;
begin
  -- 1. kademe: anlamca benzeyen çözülmüş çağrılar
  if query_embedding is not null then
    select count(*) into semantic_count
    from tickets t
    where t.embedding is not null
      and t.resolved_at is not null
      and (exclude_id is null or t.id <> exclude_id)
      and 1 - (t.embedding <=> query_embedding) >= min_similarity;
  end if;

  if semantic_count >= min_sample then
    return query
    with matched as (
      select extract(epoch from (t.resolved_at - t.created_at)) / 60 as minutes
      from tickets t
      where t.embedding is not null
        and t.resolved_at is not null
        and (exclude_id is null or t.id <> exclude_id)
        and 1 - (t.embedding <=> query_embedding) >= min_similarity
    )
    select
      'benzer çağrılar'::text,
      count(*),
      round(avg(minutes)),
      round(percentile_cont(0.5) within group (order by minutes)::numeric),
      round(min(minutes)),
      round(max(minutes))
    from matched;
    return;
  end if;

  -- 2. kademe: aynı kategorideki çözülmüş çağrılar
  return query
  with matched as (
    select extract(epoch from (t.resolved_at - t.created_at)) / 60 as minutes
    from tickets t
    where t.resolved_at is not null
      and (exclude_id is null or t.id <> exclude_id)
      and (p_category is null or t.category = p_category)
  )
  select
    'kategori ortalaması'::text,
    count(*),
    round(avg(minutes)),
    round(percentile_cont(0.5) within group (order by minutes)::numeric),
    round(min(minutes)),
    round(max(minutes))
  from matched;
end;
$$;

create or replace view test_latest_status as
select distinct on (e.test_case_id)
  e.test_case_id,
  e.id as execution_id,
  e.result,
  e.note,
  e.attachment_id,
  e.executed_by,
  e.executed_at
from test_executions e
order by e.test_case_id, e.executed_at desc;

-- ============================================================
-- 4) DOSYA DEPOSU
-- ============================================================

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'attachments_all') then
    create policy "attachments_all" on storage.objects
      for all using (bucket_id = 'attachments') with check (bucket_id = 'attachments');
  end if;
end $$;


-- ============================================================
-- 5) GÜVENLİK (RLS)
--
-- DEMO AYARI: tüm politikalar serbest.
-- Üretimde Supabase Auth kurulup politikalar role bağlanmalı.
-- Bu bilinen bir kısıttır, README'de de belirtilmiştir.
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'tickets','conversations','knowledge_base','deflections',
    'support_groups','attachments','requirements','test_cases','test_executions'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'demo_all') then
      execute format(
        'create policy demo_all on %I for all using (true) with check (true)', t);
    end if;
  end loop;
end $$;


-- ============================================================
-- 6) CANLI YAYIN (Realtime)
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array['tickets','conversations','deflections','test_cases','test_executions']
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;


-- ============================================================
-- 7) BAŞLANGIÇ VERİSİ — Destek grupları
-- ============================================================

insert into support_groups (name, description) values
  ('1. Seviye Destek', 'İlk müdahale, genel kullanıcı sorunları'),
  ('Ağ ve Altyapı', 'Ağ bağlantısı, VPN, sunucu ve altyapı'),
  ('Son Kullanıcı Donanım', 'Bilgisayar, yazıcı, çevre birimleri'),
  ('Kimlik ve Erişim', 'Hesap, şifre, yetkilendirme'),
  ('SAP Fonksiyonel', 'SAP modül ayarları ve kullanım desteği'),
  ('SAP ABAP', 'SAP geliştirme ve özel program talepleri'),
  ('Bilgi Güvenliği', 'Güvenlik olayları, şüpheli içerik'),
  ('İş Analizi', 'Talep değerlendirme, gereksinim analizi ve önceliklendirme')
on conflict (name) do nothing;


-- ============================================================
-- 8) BAŞLANGIÇ VERİSİ — Bilgi bankası
--
-- Kategori listesi bu tablodan türüyor: yapay zeka bir çağrıyı
-- sınıflandırırken yalnızca burada tanımlı kategorilerden seçebiliyor.
-- ============================================================

insert into knowledge_base (category, keywords, steps) values

('Ağ Bağlantısı',
 array['internet','vpn','bağlan','wifi','wi-fi','ağ','kopuyor','yavaş internet','site açılmıyor','bağlantı'],
 '["Wi-Fi bağlantısını kapatıp 10 saniye sonra tekrar açın","Modem veya ağ kablosunun takılı olduğunu kontrol edin","Farklı bir siteye girip sorunun genel olup olmadığına bakın","Bilgisayarı yeniden başlatın"]'::jsonb),

('Donanım - Yazıcı',
 array['yazıcı','print','çıktı','toner','kağıt','tarayıcı','fotokopi','sıkıştı'],
 '["Yazıcının açık ve hazır durumda olduğunu kontrol edin","Kağıt ve toner seviyesini kontrol edin","Yazdırma kuyruğundaki bekleyen işleri temizleyin","Yazıcıyı kapatıp 30 saniye sonra açın"]'::jsonb),

('Hesap Erişimi',
 array['şifre','parola','giriş','login','hesap','kilitlendi','oturum','doğrulama','sms kodu'],
 '["Caps Lock tuşunun kapalı olduğundan emin olun","Şifre sıfırlama bağlantısını kullanın","Farklı bir tarayıcıda veya gizli sekmede deneyin","Doğrulama kodunun geldiği telefonu kontrol edin"]'::jsonb),

('Yazılım - Performans',
 array['yavaş','donuyor','kasıyor','açılmıyor','çöküyor','takılıyor','performans','ısınıyor'],
 '["Açık olan gereksiz uygulamaları kapatın","Bilgisayarı yeniden başlatın","Disk doluluk oranını kontrol edin","Bekleyen güncellemeleri kurun"]'::jsonb),


('Donanım - Bilgisayar',
 array['klavye','fare','mouse','ekran','monitör','kasa','açılmıyor','tuş','kablo','usb','ses','hoparlör','kamera','mikrofon'],
 '["Cihazın kablosunu çıkarıp farklı bir porta takın","Bilgisayarı tamamen kapatıp yeniden açın","Varsa aynı cihazı başka bir bilgisayarda deneyin","Cihaz yöneticisinden donanımın görünüp görünmediğini kontrol edin"]'::jsonb),

('E-posta',
 array['mail','e-posta','eposta','outlook','gelen kutusu','gönderemiyorum','ek dosya','spam','takvim daveti'],
 '["Outlook''u kapatıp yeniden açın","Çevrimdışı çalışma modunun kapalı olduğundan emin olun","Posta kutusu doluluk oranınızı kontrol edin","Web arayüzünden giriş yapıp sorunun orada da olup olmadığına bakın"]'::jsonb),

('Uygulama Erişimi',
 array['uygulama','program','erişemiyorum','yetki','lisans','sap','crm','portal','sistem açılmıyor','yüklenmiyor'],
 '["Uygulamayı tamamen kapatıp yeniden açın","Tarayıcı önbelleğini temizleyip tekrar deneyin","Yetkinizin hâlâ tanımlı olduğunu yöneticinizle teyit edin","Farklı bir tarayıcı veya gizli sekmede deneyin"]'::jsonb),

('Güvenlik',
 array['virüs','şüpheli','phishing','oltalama','zararlı','kilitlendi','fidye','garip mail','hack','şifreli dosya'],
 '["Şüpheli e-postadaki hiçbir bağlantıya tıklamayın","Cihazınızı ağdan ayırın (Wi-Fi''ı kapatın)","Dosyaları silmeyin, olduğu gibi bırakın","Durumu hemen bildirin — bu tür çağrılar öncelikli işlenir"]'::jsonb),

('Dosya ve Paylaşım',
 array['dosya','klasör','paylaşım','ortak alan','sürücü','onedrive','yedek','silindi','erişim izni','kayboldu'],
 '["Geri dönüşüm kutusunu kontrol edin","Ağ sürücüsünün bağlı görünüp görünmediğine bakın","Dosyanın önceki sürümlerini kontrol edin","Klasöre erişim izniniz olup olmadığını teyit edin"]'::jsonb),

('Telefon ve Toplantı',
 array['teams','zoom','toplantı','mikrofon','kamera','ses gelmiyor','görüntü','dahili','telefon','çağrı düşmüyor'],
 '["Uygulamanın ses ve kamera iznini kontrol edin","Doğru mikrofon ve hoparlörün seçili olduğundan emin olun","Uygulamadan çıkıp yeniden giriş yapın","Kulaklığı çıkarıp bilgisayarın kendi hoparlörüyle deneyin"]'::jsonb),


('SAP',
 array['sap','me21n','me22n','abap','mm','fi','co','sd','pp','tcode','işlem kodu','satınalma siparişi','modül'],
 '["Talebiniz SAP fonksiyonel ekibine iletilir ve etki analizi yapılır","Geliştirme gerekiyorsa ABAP ekibine aktarılır","Kalite ortamında test edilmeden canlıya alınmaz","Devreye alma öncesi talep eden birimden onay istenir"]'::jsonb),

('Kurumsal Uygulama Talebi',
 array['talep','geliştirme','yeni özellik','eklensin','rapor istiyoruz','ekran','revize','değişiklik talebi','iyileştirme'],
 '["Talep önce iş analizi ekibi tarafından değerlendirilir","Gereksinimler netleştirilir ve efor tahmini çıkarılır","Önceliklendirme aylık talep toplantısında yapılır","Onaylanan talepler geliştirme takvimine alınır"]'::jsonb),

('Yetkilendirme Talebi',
 array['yetki','rol','erişim izni','yetki verilsin','profil','authorization','yetkim yok','erişemiyorum yetki'],
 '["Yetki talepleri yöneticinizin onayından sonra işleme alınır","Talep edilen rolün mevcut görevinizle uyumu kontrol edilir","Kritik yetkilerde bilgi güvenliği ekibi de onay verir","Yetki tanımlandıktan sonra oturumu kapatıp açmanız gerekir"]'::jsonb),

('Raporlama',
 array['rapor','excel','veri çekme','liste','dashboard','analiz','çıktı almak','sorgu'],
 '["Rapor talebinde hangi alanların ve hangi tarih aralığının gerektiği netleştirilir","Mevcut raporlarla karşılanabiliyorsa yeni geliştirme yapılmaz","Veri hacmine göre performans etkisi değerlendirilir","Rapor yetkilendirmesi ayrıca tanımlanır"]'::jsonb);


-- ============================================================
-- KURULUM TAMAMLANDI
--
-- Sırada:
--   1. npx supabase secrets set GEMINI_API_KEY=...
--   2. npx supabase functions deploy analyze --no-verify-jwt
--   3. npm run dev
--   4. Yönetici girişi → Yönetim → Sistem → "Eksik vektörleri tamamla"
--
-- İsteğe bağlı: ornek-veri-seti.sql ile gerçekçi geçmiş veri yükleyin.
-- ============================================================
