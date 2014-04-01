using System;
using System.Collections.Generic;
using System.Data.Entity;
using System.Data.Entity.Infrastructure;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using System.Web.Http.Description;
using BudgetAppWeb.Hubs;
using BudgetAppWeb.Models;
using BudgetAppWeb.Helpers;

namespace BudgetAppWeb.Controllers
{
    public class BudgetController : ApiController
    {
        private readonly BudgetDbContext _db = new BudgetDbContext();

        #region Default Handlers

        // GET api/Budget
        [Route("api/Budget")]
        public IEnumerable<Budget> GetBudgets(string apiKey)
        {
            if (apiKey != Helpers.Helpers.ApiKey)
            {
                Log.Error("Invalid apiKey: (1)", apiKey);
                return null;
            }

            Log.Information("Got all budgets");

            return _db.Budgets;
        }

        // GET api/Budget/5
        [Route("api/Budget/{id}")]
        [ResponseType(typeof(Budget))]
        public IHttpActionResult GetBudget(string id)
        {
            var budget = _db.Budgets.Find(id);
            if (budget == null)
            {
                Log.Error("Budget not found: (1)", id);
                return NotFound();
            }

            Log.Information("Got budget: (1)", budget);

            StreamHub.NewEvent(string.Format("Budget {0} was requested", id));

            return Ok(budget);
        }

        // PUT api/Budget/5
        [Route("api/Budget/{id}")]
        public IHttpActionResult PutBudget(string id, Budget budget)
        {
            if (budget.Name == null)
                budget.Name = "My";

            if (!ModelState.IsValid)
            {
                Log.Error("Update budget failed. Invalid state: (1)", id);
                return BadRequest(ModelState);
            }

            if (id != budget.UniqueId)
            {
                Log.Error("Update budget failed. Id mismatch: (1) vs (2)", id, budget.UniqueId);
                return BadRequest();
            }

            var b = _db.Budgets.Find(id);

            if (b == null)
            {
                Log.Error("Update budget failed. Budget not found: (1)", id);
                return NotFound();
            }

            b.Name = budget.Name;
            b.DateUpdated = DateTime.UtcNow;
            b.Amount = budget.Amount;
            b.StartDay = budget.StartDay;

            _db.Entry(b).State = EntityState.Modified;

            try
            {
                _db.SaveChanges();

                Log.Information("Updated budget: (1)", budget);

                StreamHub.NewEvent(string.Format("Budget {0} was updated", id));
            }
            catch (DbUpdateConcurrencyException ex)
            {
                if (!BudgetExists(id))
                {
                    Log.Error("Update budget failed. Budget not found in DB: (1)", id);
                    return NotFound();
                }
                Log.Error("Update budget failed: (1)", ex);
                throw;
            }

            return StatusCode(HttpStatusCode.NoContent);
        }

        // POST api/Budget
        [ResponseType(typeof(Budget))]
        [Route("api/Budget")]
        public HttpResponseMessage PostBudget(Budget budget)
        {
            if (budget.Name == null)
                budget.Name = "My";

            if (!ModelState.IsValid)
            {
                Log.Error("Create budget failed. Invalid state");
                return Request.CreateResponse(HttpStatusCode.BadRequest, ModelState);
            }

            budget.DateCreated = DateTime.UtcNow;
            budget.DateUpdated = budget.DateCreated;

            _db.Budgets.Add(budget);

            try
            {
                _db.SaveChanges();

                Log.Information("Created new budget: (1)", budget);

                StreamHub.NewEvent(string.Format("Budget {0} was created", budget.UniqueId));
            }
            catch (DbUpdateException ex)
            {
                if (BudgetExists(budget.UniqueId))
                {
                    Log.Error("Create budget failed. Budget exists: (1)", budget.UniqueId);
                    return Request.CreateResponse(HttpStatusCode.Conflict);
                }
                Log.Error("Create budget failed: (1)", ex);
                throw;
            }

            var response = Request.CreateResponse(HttpStatusCode.Created, budget);
            response.Headers.Location = new Uri(Request.RequestUri, string.Format("api/budget/{0}", budget.UniqueId));
            return response;
        }

        // DELETE api/Budget/5
        [ResponseType(typeof(Budget))]
        [Route("api/Budget/{id}")]
        public IHttpActionResult DeleteBudget(string id)
        {
            var budget = _db.Budgets.Find(id);
            if (budget == null)
            {
                Log.Error("Delete budget failed. Budget not found: (1)", id);
                return NotFound();
            }

            _db.Budgets.Remove(budget);
            _db.SaveChanges();

            Log.Information("Deleted budget: (1)", id);

            return Ok(budget);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _db.Dispose();
            }
            base.Dispose(disposing);
        }

        private bool BudgetExists(string id)
        {
            return _db.Budgets.Count(e => e.UniqueId == id) > 0;
        }

        #endregion

        #region Custom Handlers

        [Route("api/Budget/{id}/Expenses")]
        public IEnumerable<Expense> GetExpenses(string id, string watermark)
        {
            DateTime wm;

            if(!DateTime.TryParse(watermark, out wm))
                wm = new DateTime(0);

            Log.Information("Got expenses for budget (1) with watermark: (2)", id, watermark);

            StreamHub.NewEvent(string.Format("Expenses for budget {0} were requested", id));

            return _db.Expenses.Where(e =>
                e.BudgetId == id &&
                e.DateUpdated > wm
                );
        }

        [Route("api/Budget/{id}/Categories")]
        public IEnumerable<Category> GetCategories(string id, string watermark)
        {
            DateTime wm;

            if (!DateTime.TryParse(watermark, out wm))
                wm = new DateTime(0);

            Log.Information("Got categories for budget (1) with watermark: (2)", id, watermark);

            StreamHub.NewEvent(string.Format("Categories for budget {0} were requested", id));

            return _db.Categories.Where(e =>
                e.BudgetId == id &&
                e.DateUpdated > wm
                );
        }

        [Route("api/Budget/{id}/Week/{date}")]
        public IEnumerable<Expense> GetWeek(string id, long date)
        {
            var d = date.ToDateTime();

            d = new DateTime(d.Year, d.Month, d.Day);

            var budget = _db.Budgets.Find(id);
            if (budget == null)
            {
                Log.Error("Get week failed. Budget not found: (1)", id);
                return null;
            }

            var weekStart = d;
            while (weekStart.DayOfWeek.ToString() != budget.StartDayOfWeek)
            {
                weekStart = weekStart.AddDays(-1);
            }

            var weekEnd = weekStart.AddDays(7);

            Log.Information("Got week (1) for budget: (2)", d.ToString("d"), budget);
            StreamHub.NewEvent(string.Format("Week for budget {0} was requested", id));

            return _db.Expenses.Where(e =>
                e.BudgetId == id &&
                e.Date >= weekStart &&
                e.Date < weekEnd &&
                e.IsDeleted == false
                ).OrderBy(e => e.Date);
        }

        [Route("api/Budget/New")]
        public IEnumerable<Budget> GetTopBudgets(string apiKey)
        {
            if (apiKey != Helpers.Helpers.ApiKey)
            {
                Log.Error("Invalid apiKey: (1)", apiKey);
                return null;
            }

            Log.Information("Admin got recent budgets");

            return _db.Budgets.OrderByDescending(b => b.DateCreated).Take(20);
        }

        #endregion
    }
}