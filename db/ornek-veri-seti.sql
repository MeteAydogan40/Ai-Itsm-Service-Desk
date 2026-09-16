-- ============================================================
-- ÖRNEK VERİ SETİ
-- ============================================================

-- ------------------------------------------------------------
-- 1) GEÇMİŞ ÇAĞRILAR
--
-- Senaryo A (VPN) için bilinçli olarak üç farklı VPN çağrısı
-- var. Üçü de farklı kelimelerle yazılmış: "timeout", "kopuyor",
-- "bağlanamıyorum". Anahtar kelime eşleştirmesi bunları
-- birbirine bağlayamaz; semantik arama bağlar. Demoda tam da
-- bu farkı göstereceğiz.
-- ------------------------------------------------------------
insert into tickets (
  ticket_no, reporter_name, title, description, ticket_type,
  category, sub_category, affected_system, support_group,
  impact, priority, priority_reason, status, tried_steps,
  assignee, resolution_note, created_at, taken_at, resolved_at
) values

('ITSM-2026-1042', 'Elif Kaya',
 'Kullanıcı uzak bağlantıda oturumun sürekli düştüğünü bildirdi.',
 'evden çalışırken vpn bağlantım 10 dakikada bir kopuyor, tekrar bağlanmam gerekiyor',
 'Olay', 'Ağ Bağlantısı', 'VPN', 'GlobalProtect VPN', 'Ağ ve Altyapı',
 'Orta', 'Orta',
 'Tek kullanıcıyı etkiliyor ancak çalışmasını sürekli kesintiye uğrattığı için orta öncelik verildi.',
 'Çözüldü',
 '["Wi-Fi bağlantısını kapatıp 10 saniye sonra tekrar açın","VPN oturumunu kapatıp yeniden bağlanın","Bilgisayarı yeniden başlatın"]'::jsonb,
 'Burak Şen',
 'VPN istemcisi 6.0.3 sürümüne güncellendi ve bağlantı profilindeki boşta kalma zaman aşımı 30 dakikaya çıkarıldı. Kullanıcıda sorun tekrarlamadı.',
 now() - interval '18 days', now() - interval '18 days' + interval '40 minutes', now() - interval '17 days'),

('ITSM-2026-1118', 'Mehmet Aydın',
 'Kullanıcı uzak erişimde zaman aşımı hatası aldığını bildirdi.',
 'vpn e baglanmaya calisiyorum ama timeout hatasi veriyor, ofisten calisiyor evden calismiyor',
 'Olay', 'Ağ Bağlantısı', 'VPN', 'GlobalProtect VPN', 'Ağ ve Altyapı',
 'Orta', 'Yüksek',
 'Kullanıcı evden çalıştığı için hiçbir kurumsal sisteme erişemiyor; işini tamamen engellediğinden yüksek öncelik verildi.',
 'Çözüldü',
 '["VPN oturumunu kapatıp yeniden bağlanın","Farklı bir ağa (telefon hotspot) bağlanıp deneyin"]'::jsonb,
 'Burak Şen',
 'Kullanıcının ev modeminde UDP 4501 portu kapalıydı. VPN istemcisi TCP yedek moduna alındı, bağlantı sağlandı. Kalıcı çözüm için modem üreticisinin port ayarları kullanıcıya iletildi.',
 now() - interval '9 days', now() - interval '9 days' + interval '25 minutes', now() - interval '9 days' + interval '3 hours'),

('ITSM-2026-1205', 'Zeynep Arslan',
 'Kullanıcı kurumsal portala erişemediğini bildirdi.',
 'sabahtan beri sirket portalina giremiyorum, sayfa acilmiyor sürekli bekliyor',
 'Olay', 'Ağ Bağlantısı', 'VPN', 'GlobalProtect VPN', 'Ağ ve Altyapı',
 'Yüksek', 'Yüksek',
 'Aynı sabah üç farklı kullanıcıdan benzer bildirim geldiği için toplu bir erişim sorunu değerlendirildi.',
 'Çözüldü',
 '["Bilgisayarı yeniden başlatın","Farklı bir tarayıcıda deneyin"]'::jsonb,
 'Deniz Yıldız',
 'VPN sunucusunda sertifika yenilemesi sonrası istemci güven zinciri güncellenmemişti. Kök sertifika grup politikasıyla dağıtıldı, etkilenen tüm kullanıcılarda sorun giderildi.',
 now() - interval '5 days', now() - interval '5 days' + interval '15 minutes', now() - interval '5 days' + interval '2 hours'),

('ITSM-2026-1260', 'Ahmet Doğan',
 'Kullanıcı yazıcıdan çıktı alamadığını bildirdi.',
 '3. kattaki yazıcıdan çıktı alamıyorum, kuyruğa düşüyor ama basmıyor',
 'Olay', 'Donanım - Yazıcı', 'Ağ Yazıcısı', 'Kyocera 4052ci', 'Son Kullanıcı Donanım',
 'Düşük', 'Düşük',
 'Alternatif yazıcı kullanılabildiği için işi engellemiyor.',
 'Çözüldü',
 '["Yazıcının kağıt ve toner durumunu kontrol edin","Yazıcıyı kapatıp 30 saniye sonra açın"]'::jsonb,
 'Deniz Yıldız',
 'Yazdırma biriktiricisi servisi takılı kalmıştı. Servis yeniden başlatıldı ve kuyruk temizlendi. Tekrarlaması durumunda sürücü güncellemesi planlandı.',
 now() - interval '12 days', now() - interval '12 days' + interval '1 hour', now() - interval '12 days' + interval '2 hours'),

('ITSM-2026-1317', 'Selin Tunç',
 'Kullanıcı hesabının tekrar tekrar kilitlendiğini bildirdi.',
 'şifremi doğru giriyorum ama hesabım sürekli kilitleniyor, günde 3-4 kez oluyor',
 'Olay', 'Hesap Erişimi', 'Hesap Kilidi', 'Active Directory', 'Kimlik ve Erişim',
 'Orta', 'Yüksek',
 'Kullanıcı gün içinde defalarca çalışmasına ara vermek zorunda kaldığı için yüksek öncelik verildi.',
 'Çözüldü',
 '["Caps Lock tuşunun kapalı olduğundan emin olun","Şifre sıfırlama bağlantısını kullanın"]'::jsonb,
 'Burak Şen',
 'Kullanıcının cep telefonundaki eski posta hesabı eski şifreyle bağlanmaya çalışıyor ve hesabı kilitliyordu. Telefondaki hesap ayarları güncellendi, kilitlenmeler durdu.',
 now() - interval '7 days', now() - interval '7 days' + interval '30 minutes', now() - interval '6 days'),

('ITSM-2026-1388', 'Kerem Öz',
 'Kullanıcı SAP ekranının çok yavaş açıldığını bildirdi.',
 'sap acilirken cok bekliyorum, ozellikle ME23N ekrani 1 dakikadan fazla suruyor',
 'Olay', 'SAP', 'MM - Satınalma', 'SAP ECC 6.0', 'SAP Fonksiyonel',
 'Orta', 'Orta',
 'Günlük işleri yavaşlatıyor ancak tamamen engellemiyor.',
 'Çözüldü',
 '["Uygulamayı tamamen kapatıp yeniden açın","Bilgisayarı yeniden başlatın"]'::jsonb,
 'Deniz Yıldız',
 'Kullanıcının varyant ayarında tarih filtresi boştu ve tüm geçmiş kayıtlar çekiliyordu. Varsayılan varyanta son 3 ay filtresi eklendi, açılış süresi 4 saniyeye indi.',
 now() - interval '21 days', now() - interval '21 days' + interval '2 hours', now() - interval '20 days')

on conflict (ticket_no) do nothing;

-- ------------------------------------------------------------
-- 2) ÖNLENEN ÇAĞRILAR
--
-- Özet panelindeki "çağrı açılmadan çözülen oran" bu tablodan

insert into deflections (problem_text, category, resolved_at_step, created_at) values
('internete bağlanamıyorum, wifi bağlı görünüyor ama site açılmıyor', 'Ağ Bağlantısı', 1, now() - interval '16 days'),
('vpn bağlantım kopuyor sürekli', 'Ağ Bağlantısı', 2, now() - interval '14 days'),
('yazıcı çıktı vermiyor', 'Donanım - Yazıcı', 1, now() - interval '13 days'),
('outlook açılmıyor donuyor', 'E-posta', 2, now() - interval '11 days'),
('bilgisayarım çok yavaşladı', 'Yazılım - Performans', 1, now() - interval '10 days'),
('teams toplantısında mikrofonum çalışmıyor', 'Telefon ve Toplantı', 1, now() - interval '8 days'),
('ortak klasöre erişemiyorum', 'Dosya ve Paylaşım', 3, now() - interval '7 days'),
('şifremi unuttum giriş yapamıyorum', 'Hesap Erişimi', 1, now() - interval '6 days'),
('ekranım ikinci monitörü görmüyor', 'Donanım - Bilgisayar', 2, now() - interval '5 days'),
('excel dosyası açılırken hata veriyor', 'Uygulama Erişimi', 2, now() - interval '4 days'),
('yazıcıda kağıt sıkıştı temizledim ama hala basmıyor', 'Donanım - Yazıcı', 2, now() - interval '3 days'),
('sap ekranı donuyor', 'SAP', 1, now() - interval '2 days'),
('mail gönderemiyorum ek dosya yüklenmiyor', 'E-posta', 1, now() - interval '2 days'),
('klavyemde bazı tuşlar çalışmıyor', 'Donanım - Bilgisayar', 1, now() - interval '1 day');

-- ------------------------------------------------------------
-- 3) BİLGİ BANKASINA TEKNİSYEN KATKILARI
--
-- Gerçek kullanımda bu kayıtlar teknisyenler çağrı kapattıkça
-- birikiyor.
insert into knowledge_base (category, keywords, steps, source, use_count, success_count) values

('Ağ Bağlantısı',
 array['vpn','timeout','zaman aşımı','kopuyor','uzak erişim'],
 '["VPN istemcisinin sürümünü kontrol edin, 6.0.3 altındaysa güncelleyin","Ev modeminde UDP 4501 portu kapalıysa istemciyi TCP yedek moduna alın","Bağlantı profilindeki boşta kalma zaman aşımını kontrol edin"]'::jsonb,
 'technician', 11, 9),

('Hesap Erişimi',
 array['kilitleniyor','sürekli kilit','hesap kilidi'],
 '["Kullanıcının telefonunda eski şifreyle bağlanmaya çalışan bir posta hesabı olup olmadığını kontrol edin","Hesap kilit kaynağını AD olay günlüğünden tespit edin"]'::jsonb,
 'technician', 6, 6),

('SAP',
 array['yavaş','açılmıyor','me23n','varyant'],
 '["Kullanıcının ekran varyantında tarih filtresi tanımlı mı kontrol edin","Filtresiz varyantlar tüm geçmişi çektiği için açılışı yavaşlatır, varsayılan varyanta son 3 ay filtresi ekleyin"]'::jsonb,
 'technician', 4, 3);


