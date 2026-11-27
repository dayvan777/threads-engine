import { Calculator } from "@/components/Calculator";
import { eurUah } from "@/lib/nbu";

export const revalidate = 3600;
export const metadata = {
  title: "Ціна «в руках»: Україна чи Німеччина",
  description: "Порахуйте, скільки коштуватиме товар з Німеччини в Україні: доставка Нова Пошта / Meest, мито, ПДВ, курс НБУ.",
};

export default async function Page() {
  const r = await eurUah();
  return (
    <div className="grid gap-6">
      <h1 className="font-display text-[34px] font-bold uppercase leading-none">Ціна «в руках»</h1>
      <p className="text-[14px] text-ink-2">Німецька ціна + доставка + мито і ПДВ проти української ціни. З офіційним курсом НБУ.</p>
      <section className="receipt torn-top">
        <Calculator rate={r.rate} rateDate={r.date} live={r.live} />
      </section>
    </div>
  );
}
