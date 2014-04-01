using BudgetAppWeb.Hubs;
using BudgetAppWeb.Models;
using System.Web.Mvc;

namespace BudgetAppWeb.Controllers
{
    public class WebController : Controller
    {
        private readonly BudgetDbContext _db = new BudgetDbContext();

        [Route("")]
        public ActionResult NewBudget()
        {
            Session["First"] = true;

            var b = new Budget();

            StreamHub.NewEvent("Someone viewed the new budget page");

            return View(b);
        }

        [Route("Budget/{id}")]
        public ActionResult Main(string id)
        {
            Budget budget = _db.Budgets.Find(id);
            if (budget == null)
            {
                return null;
            }

            if (Session["First"] != null)
            {
                ViewBag.First = (bool)Session["First"];
            }
            else
            {
                ViewBag.First = false;
            }
            
            if (ViewBag.First)
            {
                Session["First"] = false;
            }

            StreamHub.NewEvent(string.Format("Budget {0} was viewed on the week page", id));

            return View(budget);
        }

        [Route("Budget/{id}/Month")]
        public ActionResult Month(string id)
        {
            Budget budget = _db.Budgets.Find(id);
            if (budget == null)
            {
                return null;
            }

            StreamHub.NewEvent(string.Format("Budget {0} was viewed on the month page", id));

            return View(budget);
        }

        [Route("Budget/{id}/Add")]
        public ActionResult AddExpense(string id)
        {
            Budget budget = _db.Budgets.Find(id);
            if (budget == null)
            {
                return null;
            }

            StreamHub.NewEvent(string.Format("Budget {0} was viewed on the add expense page", id));

            return View(budget);
        }

        [Route("Budget/{id}/Edit")]
        public ActionResult EditBudget(string id)
        {
            Budget budget = _db.Budgets.Find(id);
            if (budget == null)
            {
                return null;
            }

            StreamHub.NewEvent(string.Format("Budget {0} was viewed on the edit budget page", id));

            return View(budget);
        }

        [Route("Budget/{id}/Edit/{expenseId}")]
        public ActionResult EditExpense(string id, long expenseId)
        {
            Budget budget = _db.Budgets.Find(id);
            if (budget == null)
            {
                return null;
            }

            Expense expense = _db.Expenses.Find(expenseId);
            if (expense == null)
            {
                return null;
            }

            StreamHub.NewEvent(string.Format("Budget {0} was viewed on the edit expense page", id));

            return View(expense);
        }
	}
}