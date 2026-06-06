# Faz 5 - Vardiya ve Operator Yetkinlik Plani

## Amac

MES Lite'in bir sonraki buyuk adimi, uretim kayitlarini sadece is emri ve makine bazinda degil, vardiya ve operator yetkinligi bazinda da izlemek.

Bu su fabrika problemlerini cozer:

- Hangi vardiyada uretim daha dusuk?
- Hangi vardiyada fire artiyor?
- Hangi operator hangi makinede yetkili?
- Bir vardiyada kritik makine icin yetkili operator yoksa risk onceden gorulur mu?
- Ayni makinede farkli operatorlerin performansi nasil degisiyor?

## Gercek Fabrika Mantigi

Her operatorun her makineyi kullanabildigi varsayilmamali. Daha gercekci model sudur:

- Operator vardiya planinda o gun calisiyor olmalidir.
- Operator ilgili makine veya operasyon icin yetkin olmalidir.
- Yetkinlik seviyesi tutulmalidir: egitimde, yetkili, uzman.
- Bazi yetkinliklerin gecerlilik suresi olabilir.
- Uretim yoneticisi is emri atarken bu bilgileri gormelidir.

Bu nedenle sistemde sadece `assignedOperatorId` yeterli degildir. Faz 5'te operatorun vardiya uygunlugu ve makine yetkinligi de kontrol edilmelidir.

## Onerilen Veri Modeli

### Shift

Mevcut vardiya tablosu korunur:

- id
- name
- startTime
- endTime
- isActive

### OperatorShiftAssignment

Operatorun hangi gun/hangi vardiyada calistigini tutar.

- id
- operatorId
- shiftId
- workDate
- status: PLANNED, PRESENT, ABSENT

Neden:
Bir operator yetkin olsa bile o gun vardiyada degilse is atanmamali veya risk olarak gosterilmeli.

### OperatorMachineQualification

Operatorun hangi makineyi hangi seviyede kullanabildigini tutar.

- id
- operatorId
- machineId
- level: TRAINING, QUALIFIED, EXPERT
- validUntil
- notes

Neden:
Makine bazli yetkinlik olmadan "hangi operator/hangi makinede daha verimli" analizi yanlis yorumlanabilir.

### OperatorOperationQualification

Bazi fabrikalarda yetkinlik makineye degil operasyona gore verilir. Ornegin kalite kontrol, paketleme, kaynak, CNC setup gibi.

- id
- operatorId
- routeOperationId
- level
- validUntil

Neden:
Ayni makineyi kullanabilen operator, belirli bir kalite veya setup operasyonunda yetkili olmayabilir.

## MVP Kapsami

Faz 5 icin once sade baslanmali:

1. Webde Vardiyalar sayfasi
2. Operator-vardiya atama ekrani
3. Operator-makine yetkinlik ekrani
4. Is emri olustururken uygun operatorleri one cikarma
5. Raporlarda vardiya bazli uretim/fire

## Faz 5 Sonrasi Analizler

- Vardiya bazli uretim adedi
- Vardiya bazli fire orani
- Operator-makine verimlilik karsilastirmasi
- Makine icin yedek yetkili operator var mi?
- Vardiya basinda yetkinlik riski var mi?

## Kritik Karar

Sistem operatoru tamamen engellemek yerine once uyari vermeli.

Ornek:
"Ali Kaya bu makinede yetkili degil. Yine de atamak istiyor musunuz?"

Neden:
Gercek fabrikalarda acil durumlarda yonetici override yapabilir. Fakat override audit log'a yazilmalidir.
