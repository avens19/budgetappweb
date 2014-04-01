using System.Web.Mvc;
using BudgetAppWeb.Hubs;

namespace BudgetAppWeb.Controllers
{
    public class AdminController : Controller
    {
        [Route("Admin/{apiKey}/Budgets")]
        public ActionResult Budgets(string apiKey)
        {
            if (apiKey != Helpers.Helpers.ApiKey)
                return null;

            ViewBag.ApiKey = apiKey;
            ViewBag.URL = "/api/Budget?apiKey=" + apiKey;

            StreamHub.NewEvent("Admin viewed the budgets");

            return View();
        }

        [Route("Admin/{apiKey}/NewBudgets")]
        public ActionResult NewBudgets(string apiKey)
        {
            if (apiKey != Helpers.Helpers.ApiKey)
                return null;

            ViewBag.ApiKey = apiKey;
            ViewBag.URL = "/api/Budget/New?apiKey=" + apiKey;

            StreamHub.NewEvent("Admin viewed the new budgets");

            return View("Budgets");
        }

        [Route("Admin/{apiKey}/Expenses")]
        public ActionResult Expenses(string apiKey)
        {
            if (apiKey != Helpers.Helpers.ApiKey)
                return null;

            ViewBag.ApiKey = apiKey;
            ViewBag.URL = "/api/Expense?apiKey=" + apiKey;

            StreamHub.NewEvent("Admin viewed the expenses");

            return View();
        }

        [Route("Admin/{apiKey}/NewExpenses")]
        public ActionResult NewExpenses(string apiKey)
        {
            if (apiKey != Helpers.Helpers.ApiKey)
                return null;

            ViewBag.ApiKey = apiKey;
            ViewBag.URL = "/api/Expense/New?apiKey=" + apiKey;

            StreamHub.NewEvent("Admin viewed the new expenses");

            return View("Expenses");
        }

        [Route("Admin/{apiKey}/TopExpenses")]
        public ActionResult TopExpenses(string apiKey)
        {
            if (apiKey != Helpers.Helpers.ApiKey)
                return null;

            ViewBag.ApiKey = apiKey;

            StreamHub.NewEvent("Admin viewed the top expenses");

            return View("TopExpenses");
        }

        [HttpGet]
        [Route("Admin/{apiKey}/Stream")]
        public ActionResult Stream(string apiKey)
        {
            if (apiKey != Helpers.Helpers.ApiKey)
                return null;

            ViewBag.ApiKey = apiKey;

            StreamHub.NewEvent("Admin viewed the stream");

            return View();
        }
    }
}