export const defenceHelp = [
  ['#watch-game','Передає закупівлі й рішення боту. Натисніть ще раз, щоб грати самому.','Hand purchases and decisions to the bot. Press again to take over.'],
  ['#order-act','Виконує дію, написану на кнопці. Якщо вона платна, поруч є ціна.','Carries out the action on the button. Paid actions show their price.'],
  ['#shop [data-kind=unit]','Купує поповнення за гроші гарнізону. Ціна вказана на картці.','Buy another unit with garrison funds. The card shows the price.'],
  ['#shop [data-kind=placement]','Відкриває вибір майданчика для покупки.','Choose an available pad to place this purchase.'],
  ['#shop [data-kind=smoke]','Оплачує димову завісу. Рух завмирає, поки вона діє.','Pay for a smoke screen. Traffic stops while it lasts.'],
  ['#shop [data-kind=order]','Оплачує тимчасове вимкнення вказаного сервісу.','Pay to switch off the named service for a short time.'],
  ['#shop [data-kind=repair]','Латає полотно й відновлює частину виплати.','Patch the road and recover part of the grant.'],
  ['#tech .unit','Витрачає шестерні на постійне поліпшення до кінця партії.','Spend gears on an upgrade for the rest of this run.'],
  ['#resupply','Поповнює запас. Сума покупки йде в підсумок витрат.','Refill stock. The amount paid counts toward your spending total.'],
  ['#inspection','Змінює частку вантажівок, які зупиняє перевірка.','Choose how many trucks stop for inspection.'],
  ['#cash','Стільки ще можна витратити. У фіналі побачите, скільки пішло з каси.','Your spending money. The final card shows how much you spent.'],
  ['#pause','Зупиняє або продовжує поточну хвилю.','Pause or resume the current wave.']
];
export const coalitionHelp = [
  ['[data-action="auto"]','Бот сам обирає спонсора, робить покупки й веде ефір.','Let the bot pick a sponsor, shop and direct the broadcast.'],
  ['[data-offer]','Обирає контракт. На картці вказано, за які кадри заплатять.','Choose a contract. Its card tells you which footage earns money.'],
  ['.c-plus','Додає одного учасника до цієї хвилі за вказану ціну.','Buy one more unit for this wave at the displayed price.'],
  ['.c-minus','Повертає останню покупку цього типу до запуску.','Refund a unit of this type before launch.'],
  ['[data-action="attack"]','Запускає хвилю. Після цього ви керуєте камерами.','Start the wave. You take the camera controls from here.'],
  ['.feed-cams button','Відкриває цей канал. Блимаюча вкладка означає, що в кадрі скоро щось станеться.','Open this feed. A flashing tab means something is about to happen on camera.'],
  ['[data-stamp]:not(.done)','Ставить печатку. Зберіть усі три, щоб продовжити ефір.','Add a stamp. Collect all three to continue the broadcast.'],
  ['[data-action="next"]','Закриває звіт і відкриває закупівлі наступної хвилі.','Close the report and open shopping for the next wave.'],
  ['[data-action="pause"]','Ставить ефір на паузу або продовжує його.','Pause or resume the broadcast.']
];
