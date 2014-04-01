using Microsoft.Owin;
using Owin;

namespace BudgetAppWeb
{
    public class Startup
    {
        public void Configuration(IAppBuilder app)
        {
            app.MapSignalR();
        }
    }
}