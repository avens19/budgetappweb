using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Entity;
using System.Data.Entity.Infrastructure;
using System.Dynamic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using System.Web.Http.Description;
using BudgetAppWeb.Helpers;
using BudgetAppWeb.Hubs;
using BudgetAppWeb.Models;

namespace BudgetAppWeb.Controllers
{
    public class CategoriesController : ApiController
    {
        private BudgetDbContext db = new BudgetDbContext();

        // PUT: api/Categories/5
        [ResponseType(typeof(void))]
        [Route("api/Categories/{id}")]
        public IHttpActionResult PutCategory(long id, Category category)
        {
            if (!ModelState.IsValid)
            {
                Log.Error("Update category failed: (1)", id);
                return BadRequest(ModelState);
            }

            if (id != category.Id)
            {
                Log.Error("Tried to update mismatched category: (1) vs (2)", id, category.Id);
                return BadRequest();
            }

            var c = db.Categories.Find(id);

            if (c == null)
            {
                Log.Error("Update category failed. Category not found: (1)", id);
                return NotFound();
            }

            c.Name = category.Name;
            c.DateUpdated = DateTime.UtcNow;
            c.IsDeleted = category.IsDeleted;

            try
            {
                db.SaveChanges();
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!CategoryExists(id))
                {
                    return NotFound();
                }
                else
                {
                    throw;
                }
            }

            return StatusCode(HttpStatusCode.NoContent);
        }

        // POST: api/Categories
        [ResponseType(typeof(Category))]
        [Route("api/Categories")]
        public HttpResponseMessage PostCategory(Category category)
        {
            if (!ModelState.IsValid)
            {
                Log.Error("Create category failed. Invalid model state");
                return Request.CreateResponse(HttpStatusCode.BadRequest, ModelState);
            }

            category.DateCreated = DateTime.UtcNow;
            category.DateUpdated = category.DateCreated;

            db.Categories.Add(category);
            db.SaveChanges();

            Log.Information("Created new category: (1)", category);

            StreamHub.NewEvent(string.Format("Category {0} for budget {1} was created", category.Name, category.BudgetId));

            var response = Request.CreateResponse(HttpStatusCode.Created, category);
            response.Headers.Location = new Uri(Request.RequestUri, string.Format("api/category/{0}", category.Id));
            return response;
        }

        // DELETE: api/Categories/5
        [ResponseType(typeof(Category))]
        [Route("api/Categories/{id}")]
        public IHttpActionResult DeleteCategory(long id)
        {
            var c = db.Categories.Find(id);

            if (c == null)
            {
                Log.Error("Delete category failed. Category not found: (1)", id);
                return NotFound();
            }

            c.DateUpdated = DateTime.UtcNow;
            c.IsDeleted = true;

            try
            {
                db.SaveChanges();
                Log.Information("Deleted category: (1)", c);
            }
            catch (DbUpdateConcurrencyException ex)
            {
                if (!CategoryExists(id))
                {
                    Log.Error("Delete category failed. Category not found in DB: (1)", id);
                    return NotFound();
                }
                Log.Error("Delete category failed: (1)", ex);
                throw;
            }

            return Ok(c);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                db.Dispose();
            }
            base.Dispose(disposing);
        }

        private bool CategoryExists(long id)
        {
            return db.Categories.Count(e => e.Id == id) > 0;
        }
    }
}