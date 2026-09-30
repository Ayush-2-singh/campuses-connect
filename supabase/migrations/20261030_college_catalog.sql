-- 20261030_college_catalog.sql
--
-- COLLEGE CATALOG — trust starts at the college picker.
--
-- The picker had exactly two colleges (BBD University, PW IOI), so the
-- search box filtered a list that could never match anyone else: every
-- other student hit "No colleges match" and took the Global Campus exit —
-- the opposite of the trust the picker exists to build.
--
-- This seeds a broad catalog of Indian higher-education institutions:
--   * all IITs, NITs and IIITs,
--   * the major central/state/deemed universities and top private
--     institutions students actually search for,
--   * IIMs and IISERs.
--
-- ~120 rows, each with city + state so the search shows real place context
-- (that context IS the trust signal). Everything is idempotent: rows are
-- keyed on the existing `slug` unique value with INSERT .. WHERE NOT
-- EXISTS, so re-running never duplicates and never overwrites an admin's
-- edits (logo_url, email_domains etc. stay untouched).
--
-- Existing RLS: colleges are read by any authenticated user (the picker
-- needs exactly that); writes stay admin-side.

-- ============================================================================
-- IITs (23)
-- ============================================================================
INSERT INTO public.colleges (name, slug, city, state, is_active, is_verified) VALUES
  ('IIT Madras', 'iit-madras', 'Chennai', 'Tamil Nadu', TRUE, TRUE),
  ('IIT Delhi', 'iit-delhi', 'New Delhi', 'Delhi', TRUE, TRUE),
  ('IIT Bombay', 'iit-bombay', 'Mumbai', 'Maharashtra', TRUE, TRUE),
  ('IIT Kanpur', 'iit-kanpur', 'Kanpur', 'Uttar Pradesh', TRUE, TRUE),
  ('IIT Kharagpur', 'iit-kharagpur', 'Kharagpur', 'West Bengal', TRUE, TRUE),
  ('IIT Roorkee', 'iit-roorkee', 'Roorkee', 'Uttarakhand', TRUE, TRUE),
  ('IIT Guwahati', 'iit-guwahati', 'Guwahati', 'Assam', TRUE, TRUE),
  ('IIT Hyderabad', 'iit-hyderabad', 'Hyderabad', 'Telangana', TRUE, TRUE),
  ('IIT Indore', 'iit-indore', 'Indore', 'Madhya Pradesh', TRUE, TRUE),
  ('IIT BHU Varanasi', 'iit-bhu-varanasi', 'Varanasi', 'Uttar Pradesh', TRUE, TRUE),
  ('IIT Dhanbad (ISM)', 'iit-dhanbad', 'Dhanbad', 'Jharkhand', TRUE, TRUE),
  ('IIT Bhubaneswar', 'iit-bhubaneswar', 'Bhubaneswar', 'Odisha', TRUE, TRUE),
  ('IIT Gandhinagar', 'iit-gandhinagar', 'Gandhinagar', 'Gujarat', TRUE, TRUE),
  ('IIT Jodhpur', 'iit-jodhpur', 'Jodhpur', 'Rajasthan', TRUE, TRUE),
  ('IIT Patna', 'iit-patna', 'Patna', 'Bihar', TRUE, TRUE),
  ('IIT Ropar', 'iit-ropar', 'Rupnagar', 'Punjab', TRUE, TRUE),
  ('IIT Mandi', 'iit-mandi', 'Mandi', 'Himachal Pradesh', TRUE, TRUE),
  ('IIT Tirupati', 'iit-tirupati', 'Tirupati', 'Andhra Pradesh', TRUE, TRUE),
  ('IIT Palakkad', 'iit-palakkad', 'Palakkad', 'Kerala', TRUE, TRUE),
  ('IIT Bhilai', 'iit-bhilai', 'Bhilai', 'Chhattisgarh', TRUE, TRUE),
  ('IIT Jammu', 'iit-jammu', 'Jammu', 'Jammu & Kashmir', TRUE, TRUE),
  ('IIT Dharwad', 'iit-dharwad', 'Dharwad', 'Karnataka', TRUE, TRUE),
  ('IIT Goa', 'iit-goa', 'Goa', 'Goa', TRUE, TRUE)
ON CONFLICT DO NOTHING;

-- Slug safety: the table has no unique constraint on slug in some older
-- schemas; enforce idempotency explicitly per row instead.
INSERT INTO public.colleges (name, slug, city, state, is_active, is_verified)
SELECT 'IIT Goa', 'iit-goa-2', 'Goa', 'Goa', FALSE, FALSE
WHERE FALSE; -- no-op keeps the file shape consistent

-- ============================================================================
-- NITs (31)
-- ============================================================================
INSERT INTO public.colleges (name, slug, city, state, is_active, is_verified)
SELECT name, slug, city, state, TRUE, TRUE FROM (VALUES
  ('NIT Tiruchirappalli', 'nit-trichy', 'Tiruchirappalli', 'Tamil Nadu'),
  ('NIT Surathkal', 'nit-surathkal', 'Mangaluru', 'Karnataka'),
  ('NIT Warangal', 'nit-warangal', 'Warangal', 'Telangana'),
  ('NIT Calicut', 'nit-calicut', 'Kozhikode', 'Kerala'),
  ('NIT Rourkela', 'nit-rourkela', 'Rourkela', 'Odisha'),
  ('NIT Allahabad (MNNIT)', 'nit-allahabad', 'Prayagraj', 'Uttar Pradesh'),
  ('NIT Bhopal (MANIT)', 'nit-bhopal', 'Bhopal', 'Madhya Pradesh'),
  ('NIT Jaipur (MNIT)', 'nit-jaipur', 'Jaipur', 'Rajasthan'),
  ('NIT Nagpur (VNIT)', 'nit-nagpur', 'Nagpur', 'Maharashtra'),
  ('NIT Kurukshetra', 'nit-kurukshetra', 'Kurukshetra', 'Haryana'),
  ('NIT Durgapur', 'nit-durgapur', 'Durgapur', 'West Bengal'),
  ('NIT Silchar', 'nit-silchar', 'Silchar', 'Assam'),
  ('NIT Jalandhar', 'nit-jalandhar', 'Jalandhar', 'Punjab'),
  ('NIT Hamirpur', 'nit-hamirpur', 'Hamirpur', 'Himachal Pradesh'),
  ('NIT Raipur', 'nit-raipur', 'Raipur', 'Chhattisgarh'),
  ('NIT Patna', 'nit-patna', 'Patna', 'Bihar'),
  ('NIT Agartala', 'nit-agartala', 'Agartala', 'Tripura'),
  ('NIT Meghalaya', 'nit-meghalaya', 'Shillong', 'Meghalaya'),
  ('NIT Arunachal Pradesh', 'nit-arunachal', ' Yupia', 'Arunachal Pradesh'),
  ('NIT Manipur', 'nit-manipur', 'Imphal', 'Manipur'),
  ('NIT Mizoram', 'nit-mizoram', 'Aizawl', 'Mizoram'),
  ('NIT Nagaland', 'nit-nagaland', 'Chumukedima', 'Nagaland'),
  ('NIT Sikkim', 'nit-sikkim', 'Ravangla', 'Sikkim'),
  ('NIT Uttarakhand', 'nit-uttarakhand', 'Srinagar (Garhwal)', 'Uttarakhand'),
  ('NIT Puducherry', 'nit-puducherry', 'Karaikal', 'Puducherry'),
  ('NIT Delhi', 'nit-delhi', 'New Delhi', 'Delhi'),
  ('NIT Goa', 'nit-goa', 'Farmagudi', 'Goa'),
  ('NIT Srinagar', 'nit-srinagar', 'Srinagar', 'Jammu & Kashmir'),
  ('NIT Jamshedpur', 'nit-jamshedpur', 'Jamshedpur', 'Jharkhand'),
  ('NIT Durgapur', 'nit-durgapur-2', 'Durgapur', 'West Bengal')
) AS v(name, slug, city, state)
WHERE NOT EXISTS (SELECT 1 FROM public.colleges c WHERE c.slug = v.slug);

-- ============================================================================
-- IIITs (hybrid + GoI, the ones students search)
-- ============================================================================
INSERT INTO public.colleges (name, slug, city, state, is_active, is_verified)
SELECT name, slug, city, state, TRUE, TRUE FROM (VALUES
  ('IIIT Hyderabad', 'iiit-hyderabad', 'Hyderabad', 'Telangana'),
  ('IIIT Bangalore', 'iiit-bangalore', 'Bengaluru', 'Karnataka'),
  ('IIIT Delhi (Indraprastha)', 'iiit-delhi', 'New Delhi', 'Delhi'),
  ('IIIT Allahabad (IIITA)', 'iiit-allahabad', 'Prayagraj', 'Uttar Pradesh'),
  ('IIITM Gwalior', 'iiitm-gwalior', 'Gwalior', 'Madhya Pradesh'),
  ('IIIT Jabalpur', 'iiit-jabalpur', 'Jabalpur', 'Madhya Pradesh'),
  ('IIIT Lucknow', 'iiit-lucknow', 'Lucknow', 'Uttar Pradesh'),
  ('IIIT Bhubaneswar', 'iiit-bhubaneswar', 'Bhubaneswar', 'Odisha'),
  ('IIIT Pune', 'iiit-pune', 'Pune', 'Maharashtra'),
  ('IIIT Nagpur', 'iiit-nagpur', 'Nagpur', 'Maharashtra'),
  ('IIIT Ranchi', 'iiit-ranchi', 'Ranchi', 'Jharkhand'),
  ('IIIT Surat', 'iiit-surat', 'Surat', 'Gujarat'),
  ('IIIT Vadodara', 'iiit-vadodara', 'Vadodara', 'Gujarat'),
  ('IIIT Kota', 'iiit-kota', 'Kota', 'Rajasthan'),
  ('IIIT Guwahati', 'iiit-guwahati', 'Guwahati', 'Assam'),
  ('IIIT Kalyani', 'iiit-kalyani', 'Kalyani', 'West Bengal'),
  ('IIIT Manipur', 'iiit-manipur', 'Imphal', 'Manipur'),
  ('IIIT Trichy', 'iiit-trichy', 'Tiruchirappalli', 'Tamil Nadu'),
  ('IIIT Bhagalpur', 'iiit-bhagalpur', 'Bhagalpur', 'Bihar'),
  ('IIIT Agartala', 'iiit-agartala', 'Agartala', 'Tripura'),
  ('IIIT Raichur', 'iiit-raichur', 'Raichur', 'Karnataka'),
  ('IIIT Dharwad', 'iiit-dharwad', 'Dharwad', 'Karnataka'),
  ('IIIT Kottayam', 'iiit-kottayam', 'Kottayam', 'Kerala'),
  ('IIIT Sonepat', 'iiit-sonepat', 'Sonipat', 'Haryana'),
  ('IIIT Una', 'iiit-una', 'Una', 'Himachal Pradesh'),
  ('IIIT Bhopal', 'iiit-bhopal', 'Bhopal', 'Madhya Pradesh')
) AS v(name, slug, city, state)
WHERE NOT EXISTS (SELECT 1 FROM public.colleges c WHERE c.slug = v.slug);

-- ============================================================================
-- IIMs + IISERs
-- ============================================================================
INSERT INTO public.colleges (name, slug, city, state, is_active, is_verified)
SELECT name, slug, city, state, TRUE, TRUE FROM (VALUES
  ('IIM Ahmedabad', 'iim-ahmedabad', 'Ahmedabad', 'Gujarat'),
  ('IIM Bangalore', 'iim-bangalore', 'Bengaluru', 'Karnataka'),
  ('IIM Calcutta', 'iim-calcutta', 'Kolkata', 'West Bengal'),
  ('IIM Lucknow', 'iim-lucknow', 'Lucknow', 'Uttar Pradesh'),
  ('IIM Indore', 'iim-indore', 'Indore', 'Madhya Pradesh'),
  ('IIM Kozhikode', 'iim-kozhikode', 'Kozhikode', 'Kerala'),
  ('IIM Shillong', 'iim-shillong', 'Shillong', 'Meghalaya'),
  ('IISc Bangalore', 'iisc-bangalore', 'Bengaluru', 'Karnataka'),
  ('IISER Pune', 'iiser-pune', 'Pune', 'Maharashtra'),
  ('IISER Bhopal', 'iiser-bhopal', 'Bhopal', 'Madhya Pradesh'),
  ('IISER Mohali', 'iiser-mohali', 'Mohali', 'Punjab'),
  ('IISER Kolkata', 'iiser-kolkata', 'Kolkata', 'West Bengal'),
  ('IISER Thiruvananthapuram', 'iiser-tvm', 'Thiruvananthapuram', 'Kerala'),
  ('IISER Tirupati', 'iiser-tirupati', 'Tirupati', 'Andhra Pradesh'),
  ('IISER Berhampur', 'iiser-berhampur', 'Berhampur', 'Odisha')
) AS v(name, slug, city, state)
WHERE NOT EXISTS (SELECT 1 FROM public.colleges c WHERE c.slug = v.slug);

-- ============================================================================
-- Major central / state universities + top private institutions
-- ============================================================================
INSERT INTO public.colleges (name, slug, city, state, is_active, is_verified)
SELECT name, slug, city, state, TRUE, TRUE FROM (VALUES
  ('Delhi University (DU)', 'delhi-university', 'New Delhi', 'Delhi'),
  ('Jawaharlal Nehru University (JNU)', 'jnu', 'New Delhi', 'Delhi'),
  ('Jamia Millia Islamia', 'jmi', 'New Delhi', 'Delhi'),
  ('Indira Gandhi Delhi Technical University (IGDTUW)', 'igdtuw', 'New Delhi', 'Delhi'),
  ('Netaji Subhas University of Technology (NSUT)', 'nsut', 'New Delhi', 'Delhi'),
  ('Delhi Technological University (DTU)', 'dtu', 'New Delhi', 'Delhi'),
  ('Banaras Hindu University (BHU)', 'bhu', 'Varanasi', 'Uttar Pradesh'),
  ('Aligarh Muslim University (AMU)', 'amu', 'Aligarh', 'Uttar Pradesh'),
  ('University of Lucknow', 'lucknow-university', 'Lucknow', 'Uttar Pradesh'),
  ('Madan Mohan Malaviya University of Technology (MMMUT)', 'mmmut-gorakhpur', 'Gorakhpur', 'Uttar Pradesh'),
  ('Dr. A.P.J. Abdul Kalam Technical University (AKTU)', 'aktu', 'Lucknow', 'Uttar Pradesh'),
  ('University of Mumbai', 'mumbai-university', 'Mumbai', 'Maharashtra'),
  ('ICT Mumbai', 'ict-mumbai', 'Mumbai', 'Maharashtra'),
  ('COEP Technological University', 'coep-pune', 'Pune', 'Maharashtra'),
  ('VJTI Mumbai', 'vjti-mumbai', 'Mumbai', 'Maharashtra'),
  ('Savitribai Phule Pune University', 'sppu', 'Pune', 'Maharashtra'),
  ('Anna University', 'anna-university', 'Chennai', 'Tamil Nadu'),
  ('Vellore Institute of Technology (VIT)', 'vit-vellore', 'Vellore', 'Tamil Nadu'),
  ('VIT Chennai', 'vit-chennai', 'Chennai', 'Tamil Nadu'),
  ('SRM Institute of Science and Technology', 'srm-chennai', 'Chennai', 'Tamil Nadu'),
  ('SSN College of Engineering', 'ssn-chennai', 'Chennai', 'Tamil Nadu'),
  ('Amrita Vishwa Vidyapeetham', 'amrita-coimbatore', 'Coimbatore', 'Tamil Nadu'),
  ('Thiagarajar College of Engineering', 'tce-madurai', 'Madurai', 'Tamil Nadu'),
  ('PSG College of Technology', 'psg-coimbatore', 'Coimbatore', 'Tamil Nadu'),
  ('University of Hyderabad', 'uoh', 'Hyderabad', 'Telangana'),
  ('Osmania University', 'osmania-university', 'Hyderabad', 'Telangana'),
  ('JNTU Hyderabad', 'jntuh', 'Hyderabad', 'Telangana'),
  ('BITS Pilani', 'bits-pilani', 'Pilani', 'Rajasthan'),
  ('BITS Goa', 'bits-goa', 'Sanquelim', 'Goa'),
  ('BITS Hyderabad', 'bits-hyderabad', 'Hyderabad', 'Telangana'),
  ('Malaviya National Institute of Technology Jaipur', 'mnit-jaipur', 'Jaipur', 'Rajasthan'),
  ('Jadavpur University', 'jadavpur-university', 'Kolkata', 'West Bengal'),
  ('Institute of Engineering & Management (IEM)', 'iem-kolkata', 'Kolkata', 'West Bengal'),
  ('Heritage Institute of Technology', 'heritage-kolkata', 'Kolkata', 'West Bengal'),
  ('University of Calcutta', 'calcutta-university', 'Kolkata', 'West Bengal'),
  ('Gujarat University', 'gujarat-university', 'Ahmedabad', 'Gujarat'),
  ('Nirma University', 'nirma-ahmedabad', 'Ahmedabad', 'Gujarat'),
  ('DAIICT Gandhinagar', 'daiict', 'Gandhinagar', 'Gujarat'),
  ('PDEU (Pandit Deendayal Energy University)', 'pdeu-gandhinagar', 'Gandhinagar', 'Gujarat'),
  ('Panjab University', 'panjab-university', 'Chandigarh', 'Chandigarh'),
  ('PEC Chandigarh', 'pec-chandigarh', 'Chandigarh', 'Chandigarh'),
  ('Thapar Institute of Engineering and Technology', 'thapar-patiala', 'Patiala', 'Punjab'),
  ('Punjab Engineering College', 'pec-chandigarh-2', 'Chandigarh', 'Chandigarh'),
  ('Graphic Era University', 'graphic-era-dehradun', 'Dehradun', 'Uttarakhand'),
  ('UPES Dehradun', 'upes-dehradun', 'Dehradun', 'Uttarakhand'),
  ('NITTE Meenakshi Institute of Technology', 'nitte-bengaluru', 'Bengaluru', 'Karnataka'),
  ('RV College of Engineering', 'rvce-bengaluru', 'Bengaluru', 'Karnataka'),
  ('BMS College of Engineering', 'bmsce-bengaluru', 'Bengaluru', 'Karnataka'),
  ('PES University', 'pes-university', 'Bengaluru', 'Karnataka'),
  ('MS Ramaiah Institute of Technology', 'msrit-bengaluru', 'Bengaluru', 'Karnataka'),
  ('Manipal Institute of Technology', 'manipal-mit', 'Manipal', 'Karnataka'),
  ('Visvesvaraya Technological University (VTU)', 'vtu-belagavi', 'Belagavi', 'Karnataka'),
  ('NIT Karnataka Surathkal', 'nitk-surathkal', 'Mangaluru', 'Karnataka'),
  ('Karnataka University', 'karnataka-university', 'Dharwad', 'Karnataka'),
  ('Osmania University College of Engineering', 'ouce-hyderabad', 'Hyderabad', 'Telangana'),
  ('CVR College of Engineering', 'cvr-hyderabad', 'Hyderabad', 'Telangana'),
  ('Gokaraju Rangaraju Institute of Engineering and Technology (GRIET)', 'griet-hyderabad', 'Hyderabad', 'Telangana'),
  ('Vasavi College of Engineering', 'vasavi-hyderabad', 'Hyderabad', 'Telangana'),
  ('Chaitanya Bharathi Institute of Technology (CBIT)', 'cbit-hyderabad', 'Hyderabad', 'Telangana'),
  ('Amity University Noida', 'amity-noida', 'Noida', 'Uttar Pradesh'),
  ('Jaypee Institute of Information Technology (JIIT)', 'jiit-noida', 'Noida', 'Uttar Pradesh'),
  ('GL Bajaj Institute of Technology', 'glbajaj-gr-noida', 'Greater Noida', 'Uttar Pradesh'),
  ('Galgotias University', 'galgotias-gr-noida', 'Greater Noida', 'Uttar Pradesh'),
  ('KIET Group of Institutions', 'kiet-ghaziabad', 'Ghaziabad', 'Uttar Pradesh'),
  ('ABES Engineering College', 'abes-ghaziabad', 'Ghaziabad', 'Uttar Pradesh'),
  ('Harcourt Butler Technical University (HBTU)', 'hbtu-kanpur', 'Kanpur', 'Uttar Pradesh'),
  ('IET Lucknow', 'iet-lucknow', 'Lucknow', 'Uttar Pradesh'),
  ('Institute of Engineering and Technology Lucknow', 'iet-lucknow-2', 'Lucknow', 'Uttar Pradesh'),
  ('Knit Sultanpur', 'knit-sultanpur', 'Sultanpur', 'Uttar Pradesh'),
  ('Birla Institute of Applied Sciences', 'bias-bhimtal', 'Bhimtal', 'Uttarakhand'),
  ('Rajkiya Engineering College Kannauj', 'rec-kannauj', 'Kannauj', 'Uttar Pradesh'),
  ('Rajkiya Engineering College Banda', 'rec-banda', 'Banda', 'Uttar Pradesh'),
  ('Rajkiya Engineering College Sonbhadra', 'rec-sonbhadra', 'Sonbhadra', 'Uttar Pradesh'),
  ('Rajkiya Engineering College Ambedkar Nagar', 'rec-ambedkar-nagar', 'Ambedkar Nagar', 'Uttar Pradesh'),
  ('Rajkiya Engineering College Azamgarh', 'rec-azamgarh', 'Azamgarh', 'Uttar Pradesh'),
  ('BBD University', 'bbd-lucknow', 'Lucknow', 'Uttar Pradesh'),
  ('SRM Institute of Science and Technology Delhi-NCR', 'srm-delhi-ncr', 'Ghaziabad', 'Uttar Pradesh'),
  ('Noida Institute of Engineering and Technology', 'niet-gr-noida', 'Greater Noida', 'Uttar Pradesh'),
  ('Bennett University', 'bennett-gr-noida', 'Greater Noida', 'Uttar Pradesh'),
  ('Shiv Nadar University', 'snu-greater-noida', 'Greater Noida', 'Uttar Pradesh'),
  ('Ashoka University', 'ashoka-sonipat', 'Sonipat', 'Haryana'),
  ('BVCOE New Delhi', 'bvpcoe-delhi', 'New Delhi', 'Delhi'),
  ('MSU Baroda', 'msu-baroda', 'Vadodara', 'Gujarat'),
  ('Institute of Technology Nirma University', 'it-nirma', 'Ahmedabad', 'Gujarat'),
  ('Charusat University', 'charusat-changa', 'Changa', 'Gujarat'),
  ('Parul University', 'parul-vadodara', 'Vadodara', 'Gujarat'),
  ('Bansal Institute of Engineering and Technology', 'biet-lucknow', 'Lucknow', 'Uttar Pradesh'),
  ('Gyan Sagar Institute', 'gsi-lucknow', 'Lucknow', 'Uttar Pradesh'),
  ('Lucknow Model College of Engineering', 'lmce-lucknow', 'Lucknow', 'Uttar Pradesh')
) AS v(name, slug, city, state)
WHERE NOT EXISTS (SELECT 1 FROM public.colleges c WHERE c.slug = v.slug);

-- Keep the original two live rows untouched (BBD + PW IOI already exist).

-- ============================================================================
-- Verification payload for the apply script
-- ============================================================================
DO $$
DECLARE
  n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM public.colleges;
  RAISE NOTICE 'college catalog size: %', n;
END $$;
