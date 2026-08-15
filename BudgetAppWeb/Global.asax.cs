using System.Data.Entity;
using System.Web;
using System.Web.Http;
using System.Web.Mvc;
using System.Web.Routing;
using BudgetAppWeb.Models;

namespace BudgetAppWeb
{
    public class WebApiApplication : HttpApplication
    {
        protected void Application_Start()
        {
            // The schema is owned by the migrations in Migrations/, so the app
            // must never issue DDL of its own. Without this, EF's default
            // initializer tries to CREATE DATABASE whenever the catalog in the
            // connection string does not exist — which turns a typo in the
            // catalog name into "CREATE DATABASE permission denied in database
            // 'master'" rather than something that names the real problem, and
            // would have the web login creating databases if it ever could.
            Database.SetInitializer<BudgetDbContext>(null);

            AreaRegistration.RegisterAllAreas();
            GlobalConfiguration.Configure(WebApiConfig.Register);
            RouteConfig.RegisterRoutes(RouteTable.Routes);
        }
    }
}
