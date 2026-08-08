import Elysia from "elysia";

const routerConfig={
    prefix:"/email"
}
const emailRouter = new Elysia(routerConfig)
.post('/signup',()=>{})
.post('/signin',()=>{})
.post('/signout',()=>{})

export default emailRouter;