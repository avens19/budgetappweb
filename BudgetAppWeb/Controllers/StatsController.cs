using BudgetAppWeb.Models;
using System;
using System.Data.Entity.SqlServer;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Web.Http;
using BudgetAppWeb.Helpers;

namespace BudgetAppWeb.Controllers
{
    public class StatsController : ApiController
    {
        private readonly BudgetDbContext _db = new BudgetDbContext();

        // GET api/<controller>
        [Route("api/Stats")]
        public HttpResponseMessage Get(string apiKey)
        {
            if (apiKey != Helpers.Helpers.ApiKey)
            {
                Log.Error("Invalid apiKey: (1)", apiKey);
                return null;
            }

            var sb = new StringBuilder();
            sb.AppendFormat("Total Budgets: {0}<br/>", _db.Budgets.Count());
            sb.AppendFormat("Active Budgets: {0}<br/>", _db.Budgets.Join(
                _db.Expenses,
                b => b.UniqueId,
                e => e.BudgetId,
                (b, e) => new { BudgetId = b.UniqueId, e.DateUpdated })
                .Where(be => SqlFunctions.DateDiff("d", be.DateUpdated, DateTime.UtcNow) < 7)
                .GroupBy(be => be.BudgetId)
                .Select(be => be.Key)
                .Count());
            sb.AppendFormat("Active Budgets with >= 5 expenses: {0}<br/>", _db.Budgets.Join(
                _db.Expenses,
                b => b.UniqueId,
                e => e.BudgetId,
                (b, e) => new { BudgetId = b.UniqueId, e.DateUpdated })
                .Where(be => SqlFunctions.DateDiff("d", be.DateUpdated, DateTime.UtcNow) < 7)
                .GroupBy(be => be.BudgetId)
                .Where(be => be.Count() >= 5)
                .Select(be => be.Key)
                .Count());
            sb.AppendFormat("New Budgets This Week: {0}<br/>", _db.Budgets.Count(b => SqlFunctions.DateDiff("d", b.DateCreated, DateTime.Now) < 7));
            sb.AppendFormat("New Budgets Last 24 Hours: {0}<br/>", _db.Budgets.Count(b => SqlFunctions.DateDiff("d", b.DateCreated, DateTime.Now) < 1));
            sb.AppendFormat("Total Expenses: {0}<br/>", _db.Expenses.Count());
            sb.AppendFormat("New Expenses This Week: {0}<br/>", _db.Expenses.Count(b => SqlFunctions.DateDiff("d", b.DateCreated, DateTime.Now) < 7));
            sb.AppendFormat("New Expenses Last 24 Hours: {0}<br/>", _db.Expenses.Count(b => SqlFunctions.DateDiff("d", b.DateCreated, DateTime.Now) < 1));
            sb.AppendFormat("Total Categories: {0}<br/>", _db.Categories.Count());
            sb.AppendFormat("New Categories This Week: {0}<br/>", _db.Categories.Count(b => SqlFunctions.DateDiff("d", b.DateCreated, DateTime.Now) < 7));
            sb.AppendFormat("New Categories Last 24 Hours: {0}<br/>", _db.Categories.Count(b => SqlFunctions.DateDiff("d", b.DateCreated, DateTime.Now) < 1));

            Log.Information("Admin got stats");

            return new HttpResponseMessage
            {
                Content = new StringContent(
                    sb.ToString(),
                    Encoding.UTF8,
                    "text/html"
                )
            };
        }
    }
}