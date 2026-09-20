# ახალგაზრდული საქმიანობის დელეგატთა ქსელი

ეს არის HTML + CSS + JavaScript პროექტი, Vercel serverless API-ით და Supabase მონაცემთა ბაზით.

## ადგილობრივად გაშვება
ლოკალური SQLite ვერსიის გასაშვებად:

```bash
npm run dev
```

შემდეგ გახსენი `http://localhost:3000`. პროფილის ყოველი გახსნა ჩაიწერება SQLite ბაზაში და გამოჩნდება ადმინ პანელში.

მხოლოდ ვიზუალური დათვალიერებისთვის შეგიძლია გახსნა `index.html`, თუმცა ამ რეჟიმში რეალური ნახვების API არ მუშაობს.

## Vercel-ზე განთავსება

1. შექმენი Supabase project და SQL Editor-ში გაუშვი [supabase-schema.sql](supabase-schema.sql).
2. Vercel Project Settings-ში დაამატე Environment Variables:
	- `SUPABASE_URL` — Supabase project URL
	- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (ეს გასაღები მხოლოდ server-side უნდა იყოს)
	- `ADMIN_SECRET` — გრძელი შემთხვევითი საიდუმლო ტექსტი
	- `ADMIN_PASSWORD` — პირველი ადმინისტრატორის პაროლი
3. დააკავშირე GitHub repository Vercel-სთან და დააჭირე Deploy-ს, ან გაუშვი `vercel` პროექტის საქაღალდეში.

Vercel-ზე `/api/*` endpoint-ები ავტომატურად მუშაობს `api/[...path].js` Function-ით. პროფილის ნახვები ინახება Supabase-ში და ჩანს ადმინ პანელში. პაროლის შეცვლის შემდეგ ახალი პაროლი Supabase-ის `admin_settings` ცხრილში ინახება.

## მონაცემების შეცვლა
ყველა დელეგატის მონაცემი არის:
`js/data.js`

იქ შეცვალე:
- სახელი და გვარი
- მუნიციპალიტეტი
- რეგიონი
- ბიო
- სოციალური ქსელები
- ფოტოს ფაილის მისამართი

## ფოტოების დამატება
ჩააგდე ფოტოები:
- `assets/delegates/`

და `data.js`-ში მიუთითე შესაბამისი ფაილის სახელი.

მაგალითი:
`image: "assets/delegates/amiko.jpg"`

თუ ფოტო ვერ მოიძებნა, საიტი ავტომატურად აჩვენებს დროებით ინიციალების placeholder-ს.

## გვერდები
- `index.html` — მთავარი
- `delegates.html` — დელეგატები + ძებნა + რეგიონების ფილტრი
- `delegate.html?id=1` — დელეგატის პროფილი
- `about.html` — პროექტის შესახებ
