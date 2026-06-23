import Stripe from "stripe";

const stripe = new Stripe("sk_test_51RZuVfP4wKuddEc7OOv177Iv6bBT2I9W7TxwQ3EqduYW2NgQZW3o3dCsrvtJs7kkfnVwmB7yrQSc5YV2x2YpS4Tv00VcP29ksf");
// const stripe=new Stripe("sk_test_51RZw0wC2esy5ycVXNqtBStWUq76M7DIA4qagCf20ehI1YCZBySu8blfVOFZ9fmXcU1tTv7qIzAlemDd5AiUwFodL00Hn72QCWx")
const balance = await stripe.balance.retrieve();

console.log(balance);