using System;
using System.Collections.Generic;
using System.Data.Entity.Infrastructure;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using System.Web.Http.Description;
using BudgetAppWeb.Hubs;
using BudgetAppWeb.Models;
using System.Dynamic;
using BudgetAppWeb.Helpers;

namespace BudgetAppWeb.Controllers
{
    public class ExpenseController : ApiController
    {
        private readonly BudgetDbContext _db = new BudgetDbContext();

        // PUT api/Expense/5
        [Route("api/Expense/{id}")]
        public IHttpActionResult PutExpense(long id, Expense expense)
        {
            if (!ModelState.IsValid)
            {
                Log.Error("Update expense failed: (1)", id);
                return BadRequest(ModelState);
            }

            if (id != expense.Id)
            {
                Log.Error("Tried to update mismatched expense: (1) vs (2)", id, expense.Id);
                return BadRequest();
            }

            var e = _db.Expenses.Find(id);

            if (e == null)
            {
                Log.Error("Update expense failed. Expense not found: (1)", id);
                return NotFound();
            }

            e.Amount = expense.Amount;
            e.CategoryId = expense.CategoryId;
            e.Description = expense.Description;
            e.Date = expense.Date;
            e.DateUpdated = DateTime.UtcNow;
            e.IsDeleted = false;
            e.IsSystem = expense.IsSystem;

            try
            {
                _db.SaveChanges();

                Log.Information("Updated expense: (1)", e);

                StreamHub.NewEvent(string.Format("Expense {0} for budget {1} was updated", expense.Description, expense.BudgetId));
            }
            catch (DbUpdateConcurrencyException ex)
            {
                if (!ExpenseExists(id))
                {
                    Log.Error("Update expense failed. Expense not found in DB: (1)", id);
                    return NotFound();
                }
                Log.Error("Update expense failed: (1)", ex);
                throw;
            }

            return StatusCode(HttpStatusCode.NoContent);
        }

        // POST api/Expense
        [ResponseType(typeof(Expense))]
        [Route("api/Expense")]
        public HttpResponseMessage PostExpense(Expense expense)
        {
            if (!ModelState.IsValid)
            {
                Log.Error("Create expense failed. Invalid model state");
                return Request.CreateResponse(HttpStatusCode.BadRequest, ModelState);
            }

            expense.DateCreated = DateTime.UtcNow;
            expense.DateUpdated = expense.DateCreated;
            expense.IsDeleted = false;

            _db.Expenses.Add(expense);
            _db.SaveChanges();

            Log.Information("Created new expense: (1)", expense);

            StreamHub.NewEvent(string.Format("Expense {0} for budget {1} was created", expense.Description, expense.BudgetId));

            var response = Request.CreateResponse(HttpStatusCode.Created, expense);
            response.Headers.Location = new Uri(Request.RequestUri, string.Format("api/expense/{0}", expense.Id));
            return response;
        }

        // DELETE api/Expense/5
        [ResponseType(typeof(Expense))]
        [Route("api/Expense/{id}")]
        public IHttpActionResult DeleteExpense(long id)
        {
            var e = _db.Expenses.Find(id);

            if (e == null)
            {
                Log.Error("Delete expense failed. Expense not found: (1)", id);
                return NotFound();
            }

            e.DateUpdated = DateTime.UtcNow;
            e.IsDeleted = true;

            try
            {
                _db.SaveChanges();
                Log.Information("Deleted expense: (1)", e);
            }
            catch (DbUpdateConcurrencyException ex)
            {
                if (!ExpenseExists(id))
                {
                    Log.Error("Delete expense failed. Expense not found in DB: (1)", id);
                    return NotFound();
                }
                Log.Error("Delete expense failed: (1)", ex);
                throw;
            }

            return Ok(e);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _db.Dispose();
            }
            base.Dispose(disposing);
        }

        private bool ExpenseExists(long id)
        {
            return _db.Expenses.Count(e => e.Id == id) > 0;
        }
    }
}